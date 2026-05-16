import { onValue, ref, update } from 'firebase/database';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { database } from '../config/firebase';

export type DetectionBox = {
  class: string;
  confidence: number;
  box: number[];
};

export type DetectionAlert = {
  cameraId: string;
  detected: boolean;
  objects: DetectionBox[];
  timestamp: number;
  cameraName?: string;
};

type DetectionContextType = {
  detections: Record<string, DetectionAlert>;
  activeAlerts: DetectionAlert[];
  totalAlerts: number;
  getLatestDetection: (cameraId: string) => DetectionAlert | undefined;
  clearAlert: (cameraId: string) => Promise<void>;
};

const DetectionContext = createContext<DetectionContextType>({
  detections: {},
  activeAlerts: [],
  totalAlerts: 0,
  getLatestDetection: () => undefined,
  clearAlert: async () => {},
});

const toTimestamp = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
};

const toDetectionObjects = (value: unknown): DetectionBox[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const obj: DetectionBox = {
      class: String(item?.class ?? 'unknown'),
      confidence: Number(item?.confidence ?? 0),
      box: Array.isArray(item?.box) ? item.box.map((n: any) => Number(n)) : [],
    };
    return obj;
  });
};

export const DetectionProvider = ({ children }: { children: React.ReactNode }) => {
  const [detections, setDetections] = useState<Record<string, DetectionAlert>>({});

  useEffect(() => {
    const detectionsRef = ref(database, 'detections');
    const unsub = onValue(detectionsRef, (snapshot) => {
      const data = snapshot.val() as Record<string, any> | null;
      if (!data) {
        setDetections({});
        return;
      }

      const mapped: Record<string, DetectionAlert> = {};
      for (const [cameraId, entry] of Object.entries(data)) {
        const detected = Boolean(entry?.detected);
        const objects = toDetectionObjects(entry?.objects);
        const timestamp = toTimestamp(entry?.timestamp);
        const cameraName = typeof entry?.cameraName === 'string' ? entry.cameraName : undefined;

        mapped[cameraId] = {
          cameraId,
          detected,
          objects,
          timestamp,
          cameraName,
        };
      }

      setDetections(mapped);
    });

    return () => unsub();
  }, []);

  const activeAlerts = useMemo(
    () => Object.values(detections).filter((d) => d.detected && d.objects.length > 0),
    [detections]
  );

  const totalAlerts = activeAlerts.length;

  const getLatestDetection = (cameraId: string) => detections[cameraId];

  const clearAlert = async (cameraId: string) => {
    const payload = { detected: false, objects: [], timestamp: Date.now() };
    await update(ref(database, `detections/${cameraId}`), payload);
  };

  return (
    <DetectionContext.Provider
      value={{
        detections,
        activeAlerts,
        totalAlerts,
        getLatestDetection,
        clearAlert,
      }}
    >
      {children}
    </DetectionContext.Provider>
  );
};

export const useDetections = () => useContext(DetectionContext);
