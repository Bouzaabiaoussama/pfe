import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Animated, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { io, Socket } from 'socket.io-client';

const RASPBERRY_IP = '100.103.171.77';
const SENSOR_PORT  = 3001;
const SERVER_URL   = `http://${RASPBERRY_IP}:${SENSOR_PORT}`;

type SensorType = 'PIR' | 'DOOR' | 'BUTTON' | 'DHT11';
type Sensor = {
  id: string; name: string; type: SensorType;
  value: string; battery: number; online: boolean; timestamp: number;
  temperature?: number; humidity?: number;
};
type HistoryEvent = {
  id: number; device_id: string; device_name: string;
  type: string; value: string; battery: number; timestamp: number;
};

const BatteryBar = ({ level, C }: { level: number; C: any }) => {
  const color = level > 50 ? C.green : level > 20 ? C.warn : C.red;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <Feather name="battery" size={11} color={C.textMuted} />
      <View style={{ flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ width: `${level}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 10, color }}>{level}%</Text>
    </View>
  );
};

const DHT11Card = ({ sensor, C, s }: { sensor: Sensor; C: any; s: any }) => {
  const temp = sensor.temperature ?? 0;
  const hum  = sensor.humidity   ?? 0;
  const tempColor = temp > 35 ? C.red : temp > 25 ? C.warn : C.cyan;
  const humColor  = hum  > 80 ? C.red : hum  > 60 ? C.warn : C.green;
  return (
    <View style={[s.sensorCard, { borderTopColor: tempColor }]}>
      <View style={s.onlineRow}>
        <View style={[s.onlineDot, { backgroundColor: sensor.online ? C.green : C.red }]} />
        <Text style={[s.onlineText, { color: C.textMuted }]}>{sensor.online ? 'En ligne' : 'Hors ligne'}</Text>
      </View>
      <Text style={s.sensorIcon}>🌡️</Text>
      <Text style={[s.sensorLabel, { color: C.textPrimary }]}>DHT11</Text>
      <Text style={[s.sensorName,  { color: C.textMuted }]}>{sensor.name}</Text>

      <View style={s.dhtRow}>
        <Text style={s.dhtEmoji}>🌡️</Text>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[s.dhtSubLabel, { color: C.textMuted }]}>Temperature</Text>
          <Text style={[s.dhtValue, { color: tempColor }]}>{temp.toFixed(1)}°C</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: `${tempColor}20`, borderColor: `${tempColor}44` }]}>
          <Text style={[s.statusPillText, { color: tempColor }]}>
            {temp > 35 ? 'CHAUD' : temp > 25 ? 'TIEDE' : 'FRAIS'}
          </Text>
        </View>
      </View>

      <View style={s.dhtRow}>
        <Text style={s.dhtEmoji}>💧</Text>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[s.dhtSubLabel, { color: C.textMuted }]}>Humidite</Text>
          <Text style={[s.dhtValue, { color: humColor }]}>{hum.toFixed(1)}%</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: `${humColor}20`, borderColor: `${humColor}44` }]}>
          <Text style={[s.statusPillText, { color: humColor }]}>
            {hum > 80 ? 'ELEVEE' : hum > 60 ? 'MOYENNE' : 'BASSE'}
          </Text>
        </View>
      </View>

      <BatteryBar level={sensor.battery} C={C} />
      <Text style={[s.lastSeen, { color: C.textMuted }]}>
        {new Date(sensor.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );
};

const SensorCard = ({ sensor, C, s, pulseAnim }: { sensor: Sensor; C: any; s: any; pulseAnim: Animated.Value }) => {
  const isAlert =
    (sensor.type === 'PIR'    && sensor.value === 'MOTION')  ||
    (sensor.type === 'DOOR'   && sensor.value === 'OPEN')    ||
    (sensor.type === 'BUTTON' && sensor.value === 'PRESSED');

  const config: Record<string, any> = {
    PIR:    { icon: '👁️', label: 'Detecteur PIR', activeText: 'MOUVEMENT',  inactiveText: 'Calme',   activeColor: C.red,    inactiveColor: C.green  },
    DOOR:   { icon: '🚪', label: 'Capteur Porte',  activeText: 'OUVERTE',   inactiveText: 'Fermee',  activeColor: C.warn,   inactiveColor: C.green  },
    BUTTON: { icon: '🔘', label: 'Smart Button',   activeText: 'APPUYE',    inactiveText: 'Inactif', activeColor: C.cyan,   inactiveColor: C.textMuted },
  };

  const cfg   = config[sensor.type];
  const color = isAlert ? cfg.activeColor : cfg.inactiveColor;

  return (
    <Animated.View style={[
      s.sensorCard,
      { borderTopColor: color },
      isAlert && { transform: [{ scale: pulseAnim }] }
    ]}>
      <View style={s.onlineRow}>
        <View style={[s.onlineDot, { backgroundColor: sensor.online ? C.green : C.red }]} />
        <Text style={[s.onlineText, { color: C.textMuted }]}>{sensor.online ? 'En ligne' : 'Hors ligne'}</Text>
      </View>
      <Text style={s.sensorIcon}>{cfg.icon}</Text>
      <View style={[s.statusPill, { backgroundColor: `${color}20`, borderColor: `${color}44` }]}>
        <View style={[s.statusDot, { backgroundColor: color }]} />
        <Text style={[s.statusPillText, { color }]}>{isAlert ? cfg.activeText : cfg.inactiveText}</Text>
      </View>
      <Text style={[s.sensorLabel, { color: C.textPrimary }]}>{cfg.label}</Text>
      <Text style={[s.sensorName,  { color: C.textMuted }]}>{sensor.name}</Text>
      <BatteryBar level={sensor.battery} C={C} />
      <Text style={[s.lastSeen, { color: C.textMuted }]}>
        {new Date(sensor.timestamp).toLocaleTimeString()}
      </Text>
    </Animated.View>
  );
};

const IoTScreen = () => {
  const router = useRouter();
  const C = useTheme();
  const s = makeStyles(C);

  const [sensors,     setSensors]     = useState<Sensor[]>([]);
  const [history,     setHistory]     = useState<HistoryEvent[]>([]);
  const [connected,   setConnected]   = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<'sensors' | 'history'>('sensors');
  const [alerts,      setAlerts]      = useState<string[]>([]);
  const [lampOn,      setLampOn]      = useState(false);
  const [lampLoading, setLampLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 400, useNativeDriver: true }),
      ]),
      { iterations: 3 }
    ).start();
  };

  const fetchHistory = async () => {
    try {
      const res  = await fetch(`${SERVER_URL}/history`);
      const data = await res.json();
      if (data.success) setHistory(data.events);
    } catch {}
  };

  const fetchLampState = async () => {
    try {
      const res  = await fetch(`${SERVER_URL}/lamp`);
      const data = await res.json();
      if (data.success) setLampOn(data.lamp);
    } catch {}
  };

  const toggleLamp = async () => {
    setLampLoading(true);
    try {
      const res  = await fetch(`${SERVER_URL}/lamp/toggle`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setLampOn(data.lamp);
    } catch {}
    setLampLoading(false);
  };

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect',        () => { setConnected(true); setLoading(false); fetchHistory(); fetchLampState(); });
    socket.on('disconnect',     () => setConnected(false));
    socket.on('sensors_update', (data: Sensor[]) => { setSensors(data); setLoading(false); });
    socket.on('sensor_change',  (sensor: Sensor) => { setSensors(prev => prev.map(s2 => s2.id === sensor.id ? sensor : s2)); fetchHistory(); });
    socket.on('lamp_state',     (data: { lamp: boolean }) => setLampOn(data.lamp));
    socket.on('alert', (alert: { type: string; message: string }) => {
      setAlerts(prev => [alert.message, ...prev.slice(0, 4)]);
      startPulse();
      setTimeout(() => setAlerts(prev => prev.slice(0, -1)), 5000);
    });
    socket.on('connect_error', () => { setLoading(false); setConnected(false); });
    return () => { socket.disconnect(); };
  }, []);

  const getAlertIcon = (type: string) =>
    ({ PIR: '🚨', DOOR: '🚪', BUTTON: '🔘', DHT11: '🌡️' } as any)[type] ?? '⚠️';

  return (
    <View style={s.root}>

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerAccentBar} />
        <View style={s.headerInner}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={C.accentGlow} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={s.headerTitleRow}>
              <Feather name="zap" size={16} color={C.accentGlow} />
              <Text style={s.headerTitle}> IoT & Capteurs</Text>
            </View>
            <Text style={s.headerSub}>EZVIZ Smart Kit · Temps reel</Text>
          </View>
          <View style={[s.connBadge, { backgroundColor: connected ? `${C.green}18` : `${C.red}18`, borderColor: connected ? `${C.green}55` : `${C.red}55` }]}>
            <View style={[s.connDot, { backgroundColor: connected ? C.green : C.red }]} />
            <Text style={[s.connText, { color: connected ? C.green : C.red }]}>
              {connected ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      {/* STATUS BANNER */}
      <View style={[s.statusBanner, { backgroundColor: connected ? `${C.green}10` : `${C.red}10`, borderColor: connected ? `${C.green}44` : `${C.red}44` }]}>
        <View style={[s.statusDot2, { backgroundColor: connected ? C.green : C.red }]} />
        <Text style={[s.statusText, { color: connected ? C.green : C.red }]}>
          {connected ? 'Serveur connecte' : 'Serveur deconnecte'}
        </Text>
        <Text style={[s.sensorCount, { color: C.textMuted }]}>{sensors.length} capteur{sensors.length > 1 ? 's' : ''}</Text>
      </View>

      {/* ALERTES */}
      {alerts.map((msg, i) => (
        <View key={i} style={[s.alertBanner, { opacity: 1 - i * 0.2 }]}>
          <Feather name="alert-triangle" size={13} color={C.red} />
          <Text style={[s.alertText, { color: C.red }]}> {msg}</Text>
        </View>
      ))}

      {/* TABS */}
      <View style={s.tabRow}>
        {(['sensors', 'history'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && { borderBottomColor: C.accentGlow }]}
            onPress={() => { setTab(t); if (t === 'history') fetchHistory(); }}
          >
            <Text style={[s.tabText, { color: tab === t ? C.accentGlow : C.textMuted, fontWeight: tab === t ? '700' : '500' }]}>
              {t === 'sensors' ? 'Capteurs' : 'Historique'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.accentGlow} />
          <Text style={[s.loadingText, { color: C.textMuted }]}>Connexion au serveur...</Text>
        </View>
      ) : tab === 'sensors' ? (
        <ScrollView contentContainerStyle={s.content}>

          {/* GATEWAY */}
          <View style={s.gatewayCard}>
            <View style={[s.gatewayIconBox, { backgroundColor: `${C.accentGlow}15`, borderColor: C.borderGlass }]}>
              <Text style={{ fontSize: 22 }}>🏠</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.gatewayName, { color: C.textPrimary }]}>Home Gateway A3 · Q19438827</Text>
              <Text style={[s.gatewaySub,  { color: C.textMuted }]}>Raspberry Pi · {RASPBERRY_IP}:{SENSOR_PORT}</Text>
            </View>
            <View style={[s.badge, { backgroundColor: connected ? `${C.green}18` : `${C.red}18`, borderColor: connected ? `${C.green}55` : `${C.red}55` }]}>
              <Text style={{ color: connected ? C.green : C.red, fontSize: 11, fontWeight: '700' }}>
                {connected ? 'ON' : 'OFF'}
              </Text>
            </View>
          </View>

          {/* LAMPE */}
          <Text style={[s.sectionTitle, { color: C.textPrimary }]}>Controle lampe</Text>
          <View style={[s.lampCard, { borderTopColor: lampOn ? C.gold : C.border }]}>
            <View style={s.lampRow}>
              <View style={s.lampLeft}>
                <Text style={{ fontSize: 40 }}>{lampOn ? '💡' : '🔦'}</Text>
                <View style={{ marginLeft: 12 }}>
                  <Text style={[s.sensorLabel, { color: C.textPrimary, textAlign: 'left' }]}>Lampe</Text>
                  <View style={[s.statusPill, { backgroundColor: lampOn ? `${C.gold}20` : `${C.textMuted}15`, borderColor: lampOn ? `${C.gold}55` : C.border, alignSelf: 'flex-start', marginTop: 4, marginBottom: 0 }]}>
                    <View style={[s.statusDot, { backgroundColor: lampOn ? C.gold : C.textMuted }]} />
                    <Text style={[s.statusPillText, { color: lampOn ? C.gold : C.textMuted }]}>
                      {lampOn ? 'ALLUMEE' : 'ETEINTE'}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                onPress={toggleLamp}
                disabled={lampLoading}
                style={[s.lampBtn, { backgroundColor: lampOn ? `${C.gold}18` : `${C.textMuted}10`, borderColor: lampOn ? `${C.gold}66` : C.border }]}
              >
                {lampLoading
                  ? <ActivityIndicator size="small" color={C.accentGlow} />
                  : <>
                      <Feather name={lampOn ? 'power' : 'zap'} size={16} color={lampOn ? C.gold : C.textMuted} />
                      <Text style={[s.lampBtnText, { color: lampOn ? C.gold : C.textMuted }]}>
                        {lampOn ? 'Eteindre' : 'Allumer'}
                      </Text>
                    </>
                }
              </TouchableOpacity>
            </View>
            <View style={[s.lampInfo, { borderTopColor: C.border }]}>
              <Feather name="info" size={11} color={C.textMuted} />
              <Text style={[s.lampInfoText, { color: C.textMuted }]}>
                Le PIR allume automatiquement la lampe lors d'un mouvement
              </Text>
            </View>
          </View>

          {/* CAPTEURS */}
          <Text style={[s.sectionTitle, { color: C.textPrimary }]}>Capteurs en temps reel</Text>
          {sensors.length === 0 ? (
            <View style={s.center}>
              <Text style={{ color: C.textMuted }}>Aucun capteur detecte</Text>
            </View>
          ) : (
            <View style={s.grid}>
              {sensors.map(sensor =>
                sensor.type === 'DHT11'
                  ? <DHT11Card   key={sensor.id} sensor={sensor} C={C} s={s} />
                  : <SensorCard  key={sensor.id} sensor={sensor} C={C} s={s} pulseAnim={pulseAnim} />
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <Text style={[s.sectionTitle, { color: C.textPrimary }]}>Historique</Text>
          {history.length === 0 ? (
            <View style={s.center}>
              <Text style={{ color: C.textMuted }}>Aucun evenement</Text>
            </View>
          ) : (
            history.map(event => {
              const isAlert2 = event.value === 'MOTION' || event.value === 'OPEN' || event.value === 'PRESSED';
              const evColor  = isAlert2 ? C.red : C.green;
              return (
                <View key={event.id} style={s.historyItem}>
                  <View style={[s.historyIconBox, { backgroundColor: `${evColor}15`, borderColor: `${evColor}44` }]}>
                    <Text style={{ fontSize: 18 }}>{getAlertIcon(event.type)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyName,  { color: C.textPrimary }]}>{event.device_name}</Text>
                    <View style={[s.statusPill, { backgroundColor: `${evColor}15`, borderColor: `${evColor}44`, alignSelf: 'flex-start', marginTop: 4, marginBottom: 0 }]}>
                      <View style={[s.statusDot, { backgroundColor: evColor }]} />
                      <Text style={[s.statusPillText, { color: evColor }]}>{event.value}</Text>
                    </View>
                  </View>
                  <Text style={[s.historyTime, { color: C.textMuted }]}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (C: any) => StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },
  header:          { backgroundColor: C.surface, overflow: 'hidden' },
  headerAccentBar: { height: 3, backgroundColor: C.accentGlow },
  headerInner:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 44, paddingBottom: 14 },
  headerTitleRow:  { flexDirection: 'row', alignItems: 'center' },
  headerTitle:     { color: C.textPrimary, fontSize: 20, fontWeight: '700' },
  headerSub:       { color: C.textMuted, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
  iconBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  connBadge:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, gap: 5 },
  connDot:         { width: 7, height: 7, borderRadius: 4 },
  connText:        { fontSize: 11, fontWeight: '700' },
  statusBanner:    { flexDirection: 'row', alignItems: 'center', margin: 10, padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  statusDot2:      { width: 8, height: 8, borderRadius: 4 },
  statusText:      { fontSize: 13, fontWeight: '700', flex: 1 },
  sensorCount:     { fontSize: 11 },
  alertBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.red}12`, borderLeftWidth: 3, borderLeftColor: C.red, marginHorizontal: 10, marginBottom: 4, padding: 10, borderRadius: 8 },
  alertText:       { fontSize: 13, fontWeight: '700' },
  tabRow:          { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:          { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:         { fontSize: 13 },
  content:         { padding: 12, paddingBottom: 30 },
  center:          { alignItems: 'center', paddingVertical: 40 },
  loadingText:     { marginTop: 12, fontSize: 14 },
  gatewayCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  gatewayIconBox:  { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  gatewayName:     { fontSize: 13, fontWeight: '700' },
  gatewaySub:      { fontSize: 11, marginTop: 3 },
  badge:           { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  sectionTitle:    { fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 4, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textMuted },
  lampCard:        { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderTopWidth: 3, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  lampRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lampLeft:        { flexDirection: 'row', alignItems: 'center' },
  lampBtn:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 6 },
  lampBtnText:     { fontSize: 13, fontWeight: '700' },
  lampInfo:        { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 6 },
  lampInfoText:    { fontSize: 11, flex: 1 },
  grid:            { gap: 10 },
  sensorCard:      { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderTopWidth: 3, borderWidth: 1, borderColor: C.border },
  onlineRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  onlineDot:       { width: 7, height: 7, borderRadius: 4 },
  onlineText:      { fontSize: 10 },
  sensorIcon:      { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  statusPill:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, alignSelf: 'center', marginBottom: 8, gap: 5 },
  statusDot:       { width: 6, height: 6, borderRadius: 3 },
  statusPillText:  { fontSize: 11, fontWeight: '700' },
  sensorLabel:     { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  sensorName:      { fontSize: 11, textAlign: 'center', marginTop: 2 },
  lastSeen:        { fontSize: 10, textAlign: 'center', marginTop: 6 },
  dhtRow:          { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dhtEmoji:        { fontSize: 20 },
  dhtSubLabel:     { fontSize: 11 },
  dhtValue:        { fontSize: 22, fontWeight: '800' },
  historyItem:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, padding: 14, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 12 },
  historyIconBox:  { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  historyName:     { fontSize: 13, fontWeight: '700' },
  historyTime:     { fontSize: 11 },
});

export default IoTScreen;