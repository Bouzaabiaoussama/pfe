import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DetectionAlert } from '../context/DetectionContext';
import { useTheme } from '../context/ThemeContext';

type Props = {
  alert: DetectionAlert;
  onDismiss?: () => void;
  onViewDetails?: () => void;
};

const formatTimestamp = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString();
};

export const AlertCard = ({ alert, onDismiss, onViewDetails }: Props) => {
  const C = useTheme();
  const s = makeStyles(C);

  const firstObj = alert.objects[0];
  const label = firstObj
    ? `${firstObj.class.toUpperCase()} ${Math.round(firstObj.confidence * 100)}%`
    : 'Detection';
  const cameraLabel = alert.cameraName
    ? alert.cameraName
    : `Camera ${alert.cameraId.slice(0, 6)}`;
  const timeLabel = formatTimestamp(alert.timestamp);

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.titleRow}>
          <MaterialCommunityIcons name="fire-alert" size={18} color={C.offline} />
          <Text style={s.title}>Alert</Text>
        </View>
        {timeLabel ? <Text style={s.time}>{timeLabel}</Text> : null}
      </View>

      <Text style={s.label}>{label}</Text>
      <Text style={s.camera}>Camera: {cameraLabel}</Text>

      <View style={s.actions}>
        {onViewDetails ? (
          <TouchableOpacity style={s.viewBtn} onPress={onViewDetails}>
            <Text style={s.viewText}>View</Text>
          </TouchableOpacity>
        ) : null}
        {onDismiss ? (
          <TouchableOpacity style={s.dismissBtn} onPress={onDismiss}>
            <Text style={s.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const makeStyles = (C: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
      marginHorizontal: 12,
      marginBottom: 10,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
    time: { color: C.textMuted, fontSize: 11 },
    label: { color: C.offline, fontSize: 13, fontWeight: '700', marginTop: 6 },
    camera: { color: C.textSecond, fontSize: 12, marginTop: 4 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
    viewBtn: {
      backgroundColor: C.accent,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    viewText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    dismissBtn: {
      backgroundColor: C.surfaceAlt,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    dismissText: { color: C.textPrimary, fontSize: 12, fontWeight: '700' },
  });
