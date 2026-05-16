import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ref, onValue, set, remove, update, off, push } from 'firebase/database';
import { database } from '../config/firebase';

const RASPBERRY_IP = '100.103.171.77';
const SENSOR_PORT  = 3001;
const SERVER_URL   = `http://${RASPBERRY_IP}:${SENSOR_PORT}`;

// ─── Firebase path ───────────────────────────────────────────────────────────
const FB_ALERTS_PATH = 'alerts';

export type AlertType     = 'motion' | 'door' | 'alarm' | 'camera' | 'button';
export type AlertSeverity = 'high' | 'medium' | 'low';

export type AlertItem = {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  severity: AlertSeverity;
  time: string;
  timestamp: number;
  resolved: boolean;
  location: string;
};

type AlertsContextType = {
  alerts: AlertItem[];
  activeCount: number;
  resolveAlert: (id: string) => void;
  deleteAlert:  (id: string) => void;
  resolveAll:   () => void;
  connected:    boolean;
  fbConnected:  boolean;
};

const AlertsContext = createContext<AlertsContextType>({
  alerts: [], activeCount: 0,
  resolveAlert: () => {}, deleteAlert: () => {}, resolveAll: () => {},
  connected: false, fbConnected: false,
});

export const useAlerts = () => useContext(AlertsContext);

// ─── Helper : build alert from sensor event ──────────────────────────────────
function makeAlert(type: AlertType, sensorName: string, timestamp: number): Omit<AlertItem, 'id'> {
  const timeStr = new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const configs: Record<string, { title: string; message: string; severity: AlertSeverity; location: string }> = {
    motion: { title: 'Mouvement détecté', message: `Mouvement détecté par ${sensorName}`, severity: 'high',   location: `PIR - ${sensorName}`    },
    door:   { title: 'Porte ouverte',     message: `${sensorName} ouverte`,               severity: 'medium', location: `Porte - ${sensorName}`   },
    alarm:  { title: 'Bouton pressé',     message: `${sensorName} activé`,                severity: 'high',   location: `Bouton - ${sensorName}`  },
  };
  const conf = configs[type] ?? { title: 'Alerte', message: sensorName, severity: 'medium', location: sensorName };
  return {
    type, title: conf.title, message: conf.message,
    severity: conf.severity, time: `À ${timeStr}`,
    timestamp, resolved: false, location: conf.location,
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────
export const AlertsProvider = ({ children }: { children: React.ReactNode }) => {
  const [alerts,      setAlerts]      = useState<AlertItem[]>([]);
  const [connected,   setConnected]   = useState(false);
  const [fbConnected, setFbConnected] = useState(false);
  const socketRef  = useRef<Socket | null>(null);
  const prevStates = useRef<Record<string, string>>({});

  // ── 1. Charger + écouter les alertes depuis Firebase ─────────────────────
  useEffect(() => {
    const alertsRef = ref(database, FB_ALERTS_PATH);

    const unsub = onValue(
      alertsRef,
      (snap) => {
        setFbConnected(true);
        const data = snap.val();
        if (!data) { setAlerts([]); return; }

        const list: AlertItem[] = Object.entries(data).map(([fbKey, val]: any) => ({
          id:        fbKey,
          type:      val.type      ?? 'alarm',
          title:     val.title     ?? 'Alerte',
          message:   val.message   ?? '',
          severity:  val.severity  ?? 'medium',
          time:      val.time      ?? '--:--',
          timestamp: val.timestamp ?? 0,
          resolved:  val.resolved  ?? false,
          location:  val.location  ?? '',
        }));

        // Trier par timestamp décroissant (plus récent en premier)
        list.sort((a, b) => b.timestamp - a.timestamp);
        setAlerts(list);
      },
      () => setFbConnected(false)
    );

    return () => off(alertsRef);
  }, []);

  // ── 2. Écouter les capteurs via Socket.IO ─────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('sensor_change', async (sensor: any) => {
      const prev = prevStates.current[sensor.id];
      prevStates.current[sensor.id] = sensor.value;

      let alertType: AlertType | null = null;

      if (sensor.type === 'PIR'    && sensor.value === 'MOTION'  && prev !== 'MOTION')  alertType = 'motion';
      if (sensor.type === 'DOOR'   && sensor.value === 'OPEN'    && prev !== 'OPEN')    alertType = 'door';
      if (sensor.type === 'BUTTON' && sensor.value === 'PRESSED' && prev !== 'PRESSED') alertType = 'alarm';

      if (!alertType) return;

      // Sauvegarder dans Firebase → onValue ci-dessus met à jour le state automatiquement
      try {
        const alertsRef = ref(database, FB_ALERTS_PATH);
        const newRef    = push(alertsRef);                         // génère un ID Firebase unique
        const alertData = makeAlert(alertType, sensor.name, sensor.timestamp ?? Date.now());
        await set(newRef, alertData);
      } catch (e) {
        console.warn('[AlertsContext] Firebase write error:', e);
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  // ── 3. Actions ──────────────────────────────────────────────────────────────

  // Marquer une alerte comme résolue dans Firebase
  const resolveAlert = async (id: string) => {
    try {
      await update(ref(database, `${FB_ALERTS_PATH}/${id}`), { resolved: true });
    } catch (e) {
      console.warn('[AlertsContext] resolveAlert error:', e);
    }
  };

  // Supprimer une alerte de Firebase
  const deleteAlert = async (id: string) => {
    try {
      await remove(ref(database, `${FB_ALERTS_PATH}/${id}`));
    } catch (e) {
      console.warn('[AlertsContext] deleteAlert error:', e);
    }
  };

  // Marquer toutes les alertes actives comme résolues dans Firebase
  const resolveAll = async () => {
    try {
      const updates: Record<string, boolean> = {};
      alerts
        .filter(a => !a.resolved)
        .forEach(a => { updates[`${FB_ALERTS_PATH}/${a.id}/resolved`] = true; });
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }
    } catch (e) {
      console.warn('[AlertsContext] resolveAll error:', e);
    }
  };

  const activeCount = alerts.filter(a => !a.resolved).length;

  return (
    <AlertsContext.Provider value={{
      alerts, activeCount,
      resolveAlert, deleteAlert, resolveAll,
      connected, fbConnected,
    }}>
      {children}
    </AlertsContext.Provider>
  );
};