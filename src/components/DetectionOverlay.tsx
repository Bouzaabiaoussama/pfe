import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DetectionBox } from '../context/DetectionContext';
import { useTheme } from '../context/ThemeContext';

type Props = {
  detections: DetectionBox[];
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

type Rect = { x: number; y: number; w: number; h: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toRect = (
  box: number[],
  width: number,
  height: number,
  sourceWidth?: number,
  sourceHeight?: number
): Rect | null => {
  if (!box || box.length < 4) return null;

  const [x1, y1, x2, y2] = box;
  const normalized = x2 <= 1.5 && y2 <= 1.5;

  let left = x1;
  let top = y1;
  let right = x2;
  let bottom = y2;

  if (normalized) {
    left = x1 * width;
    top = y1 * height;
    right = x2 * width;
    bottom = y2 * height;
  } else if (sourceWidth && sourceHeight) {
    left = (x1 / sourceWidth) * width;
    top = (y1 / sourceHeight) * height;
    right = (x2 / sourceWidth) * width;
    bottom = (y2 / sourceHeight) * height;
  }

  const w = clamp(right - left, 0, width);
  const h = clamp(bottom - top, 0, height);
  const x = clamp(left, 0, width - w);
  const y = clamp(top, 0, height - h);

  if (w <= 1 || h <= 1) return null;
  return { x, y, w, h };
};

export const DetectionOverlay = ({ detections, width, height, sourceWidth, sourceHeight }: Props) => {
  const C = useTheme();

  if (!detections || detections.length === 0) return null;

  return (
    <View pointerEvents="none" style={[styles.overlay, { width, height }]}> 
      {detections.map((det, index) => {
        const rect = toRect(det.box, width, height, sourceWidth, sourceHeight);
        if (!rect) return null;
        const label = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;

        return (
          <View
            key={`${det.class}-${index}`}
            style={[
              styles.box,
              {
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                borderColor: C.offline,
              },
            ]}
          >
            <View style={[styles.label, { backgroundColor: C.offline }]}> 
              <Text style={styles.labelText}>{label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0 },
  box: { position: 'absolute', borderWidth: 2, borderRadius: 4 },
  label: { position: 'absolute', top: -18, left: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  labelText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
