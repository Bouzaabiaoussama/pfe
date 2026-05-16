import { get, onValue, ref, remove, set } from 'firebase/database';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { database } from '../config/firebase';
import { useAuth } from './AuthContext';

export type Camera = {
  id: string; name: string; ip: string;
  uri: string; uriLocal?: string; uriTailscale?: string; location: string;
};

type NetworkMode = 'local' | 'tailscale';

const RASPBERRY_IP = '100.103.171.77';
const BACKEND_PORT = 3000;
const API_KEY      = 'planet123_secret';

const backendFetch = async (path: string, options?: RequestInit) =>
  fetch(`http://${RASPBERRY_IP}:${BACKEND_PORT}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...(options?.headers || {}) },
  });

const toStreamName = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');

const buildTailscaleUri = (_: string, streamName: string) =>
  `rtsp://${RASPBERRY_IP}:8554/${streamName}`;

// Pas de cameras par defaut hardcodees
// Toutes les cameras (DVR, NVR, IP) sont ajoutees via le formulaire Config

type CameraContextType = {
  cameras: Camera[]; loadingCameras: boolean;
  addCamera: (cam: Camera) => Promise<{ success: boolean; error?: string }>;
  deleteCamera: (id: string) => Promise<{ success: boolean; error?: string }>;
  networkMode: NetworkMode; switchNetwork: (mode: NetworkMode) => void;
};

const CameraContext = createContext<CameraContextType>({
  cameras: [], loadingCameras: true,
  addCamera: async () => ({ success: false }),
  deleteCamera: async () => ({ success: false }),
  networkMode: 'tailscale', switchNetwork: () => {},
});

export const CameraProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [networkMode,    setNetworkMode]    = useState<NetworkMode>('tailscale');
  const [cameras,        setCameras]        = useState<Camera[]>([]);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [modeLoaded,     setModeLoaded]     = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) { setModeLoaded(true); return; }
    get(ref(database, `settings/${uid}/networkMode`)).then((snap) => {
      if (snap.exists()) setNetworkMode(snap.val() as NetworkMode);
      setModeLoaded(true);
    });
  }, [uid]);

  useEffect(() => {
    if (!uid || !modeLoaded) return;
    const dbPath = `cameras/${uid}/${networkMode}`;
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    setLoadingCameras(true);

    const initAndListen = async () => {
      // Ecouter Firebase directement — aucune ecriture automatique
      const unsub = onValue(ref(database, dbPath), (snapshot) => {
        if (snapshot.exists()) {
          const adapted: Camera[] = (Object.values(snapshot.val()) as Camera[]).map(cam => ({
            ...cam,
            uri: networkMode === 'tailscale' ? (cam.uriTailscale || cam.uri) : (cam.uriLocal || cam.uri),
          }));
          setCameras(adapted);
        } else { setCameras([]); }
        setLoadingCameras(false);
      });
      unsubscribeRef.current = unsub;
    };

    initAndListen();
    return () => { if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; } };
  }, [uid, networkMode, modeLoaded]);

  // ── addCamera ─────────────────────────────────────────────────
  // Flow identique DVR et NVR Dahua :
  //   1. Firebase  : sauvegarde local + tailscale
  //   2. Raspberry : POST /streams { name, source }
  //      DVR source : rtsp://user:pass@ip:554/Streaming/Channels/101
  //      NVR source : rtsp://user:pass@ip:554/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif
  //   3. Raspberry : POST /restart
  const addCamera = async (cam: Camera): Promise<{ success: boolean; error?: string }> => {
    if (!uid) return { success: false, error: 'Utilisateur non connecte' };

    const streamName   = toStreamName(cam.name);
    const tailscaleUri = buildTailscaleUri(cam.uri, streamName);

    const camLocal: Camera    = { ...cam, uri: cam.uri,        uriLocal: cam.uri, uriTailscale: tailscaleUri };
    const camTailscale: Camera = { ...cam, ip: RASPBERRY_IP, uri: tailscaleUri, uriLocal: cam.uri, uriTailscale: tailscaleUri };

    try {
      await Promise.all([
        set(ref(database, `cameras/${uid}/local/${cam.id}`),     camLocal),
        set(ref(database, `cameras/${uid}/tailscale/${cam.id}`), camTailscale),
      ]);

      const addRes = await backendFetch('/streams', {
        method: 'POST',
        body: JSON.stringify({ name: streamName, source: cam.uri }),
      });
      if (!addRes.ok) console.warn('[CameraContext] Backend /streams warning:', await addRes.json());

      await backendFetch('/restart', { method: 'POST' });
      return { success: true };
    } catch (e: any) {
      console.error('[CameraContext] Erreur addCamera:', e);
      return { success: false, error: e.message || 'Erreur inconnue' };
    }
  };

  const deleteCamera = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!uid) return { success: false, error: 'Utilisateur non connecte' };
    const cam = cameras.find(c => c.id === id);
    const streamName = cam ? toStreamName(cam.name) : null;
    try {
      await Promise.all([
        remove(ref(database, `cameras/${uid}/local/${id}`)),
        remove(ref(database, `cameras/${uid}/tailscale/${id}`)),
      ]);
      if (streamName) {
        const delRes = await backendFetch(`/streams/${streamName}`, { method: 'DELETE' });
        if (!delRes.ok) console.warn('[CameraContext] Backend DELETE warning:', await delRes.json());
        await backendFetch('/restart', { method: 'POST' });
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Erreur inconnue' };
    }
  };

  const switchNetwork = async (mode: NetworkMode) => {
    setNetworkMode(mode);
    if (uid) { try { await set(ref(database, `settings/${uid}/networkMode`), mode); } catch {} }
  };

  return (
    <CameraContext.Provider value={{ cameras, loadingCameras, addCamera, deleteCamera, networkMode, switchNetwork }}>
      {children}
    </CameraContext.Provider>
  );
};

export const useCameras = () => useContext(CameraContext);