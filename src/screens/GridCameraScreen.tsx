import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCameras } from '../context/CameraContext';
import { useTheme } from '../context/ThemeContext';


const { VLCPlayer } = require('react-native-vlc-media-player');

const { width } = Dimensions.get('window');
const CELL_SIZE = (width - 36) / 2;


const GridCameraScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);
  const router = useRouter();
  const { cameras } = useCameras();
  const [layout, setLayout]         = useState<'2x2' | '1x1'>('2x2');
  const [focusedId, setFocusedId]   = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<{ [key: string]: 'connecting' | 'online' | 'offline' }>({});

  const focusedCamera = cameras.find(c => c.id === focusedId);

  const handlePlaying = (id: string) => setCameraStatus(prev => ({ ...prev, [id]: 'online' }));
  const handleError   = (id: string) => setCameraStatus(prev => ({ ...prev, [id]: 'offline' }));
  const getStatus     = (id: string) => cameraStatus[id] || 'connecting';

  const getStatusColor = (status: string) => {
    if (status === 'online')  return C.online;
    if (status === 'offline') return C.offline;
    return C.warn;
  };
  const getStatusLabel = (status: string) => {
    if (status === 'online')  return 'EN LIGNE';
    if (status === 'offline') return 'HORS LIGNE';
    return 'CONNEXION...';
  };
  const getStatusIcon = (status: string) =>
    status === 'online' ? 'wifi' : status === 'offline' ? 'wifi-off' : 'loader';

  // ── Status pill ──────────────────────────────────────────
  const StatusPill = ({ id, small = false }: { id: string; small?: boolean }) => {
    const st    = getStatus(id);
    const color = getStatusColor(st);
    return (
      <View style={[s.statusPill, { borderColor: color + '55' }, small && s.statusPillSm]}>
        <Feather name={getStatusIcon(st) as any} size={small ? 8 : 10} color={color} />
        <Text style={[s.statusPillText, { color }, small && { fontSize: 8 }]}>
          {' '}{getStatusLabel(st)}
        </Text>
      </View>
    );
  };

  return (
    <View style={s.container}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerAccentBar} />
        <View style={s.headerInner}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={C.accentGlow} />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <MaterialCommunityIcons name="view-grid-outline" size={18} color={C.accentGlow} />
            <View style={{ marginLeft: 8 }}>
              <Text style={s.headerTitle}>Multi-Caméras</Text>
              <Text style={s.headerSub}>{cameras.length} caméras · En direct</Text>
            </View>
          </View>

          <View style={s.layoutBtns}>
            <TouchableOpacity
              style={[s.layoutBtn, layout === '2x2' && s.layoutBtnActive]}
              onPress={() => { setLayout('2x2'); setFocusedId(null); }}>
              <MaterialCommunityIcons
                name="view-grid-outline"
                size={18}
                color={layout === '2x2' ? '#fff' : C.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.layoutBtn, layout === '1x1' && s.layoutBtnActive]}
              onPress={() => setLayout('1x1')}>
              <MaterialCommunityIcons
                name="rectangle-outline"
                size={18}
                color={layout === '1x1' ? '#fff' : C.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Vue focus ── */}
      {focusedId && focusedCamera && layout === '2x2' && (
        <View style={s.focusedWrap}>
          <VLCPlayer
            style={s.focusedVideo}
            source={{ uri: focusedCamera.uri }}
            autoplay={true}
            onPlaying={() => handlePlaying(focusedCamera.id)}
            onError={() => handleError(focusedCamera.id)}
          />
          {/* Overlay top */}
          <View style={s.focusedTopBar}>
            <StatusPill id={focusedCamera.id} />
            <View style={s.focusedNamePill}>
              <Feather name="video" size={11} color={C.accentGlow} />
              <Text style={s.focusedNameText}> {focusedCamera.name}</Text>
            </View>
          </View>
          {/* Close bar */}
          <TouchableOpacity style={s.focusedCloseBar} onPress={() => setFocusedId(null)}>
            <Feather name="x" size={14} color={C.textMuted} />
            <Text style={s.focusedCloseText}> Fermer le focus</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Grille ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={layout === '1x1' ? s.listContent : s.gridContent}
        showsVerticalScrollIndicator={false}
      >
        {cameras.map((cam) => (
          <TouchableOpacity
            key={cam.id}
            style={[
              layout === '2x2' ? s.gridCell : s.listCell,
              focusedId === cam.id && s.gridCellFocused,
            ]}
            onPress={() => {
              if (layout === '2x2') setFocusedId(focusedId === cam.id ? null : cam.id);
            }}
            activeOpacity={0.88}
          >
            <VLCPlayer
              style={layout === '2x2' ? s.gridVideo : s.listVideo}
              source={{ uri: cam.uri }}
              autoplay={true}
              onPlaying={() => handlePlaying(cam.id)}
              onError={() => handleError(cam.id)}
            />

            {/* Top overlay */}
            <View style={s.cellTopOverlay}>
              <StatusPill id={cam.id} small />
              {focusedId === cam.id && (
                <View style={s.focusBadge}>
                  <Feather name="maximize-2" size={8} color="#fff" />
                  <Text style={s.focusBadgeText}> Focus</Text>
                </View>
              )}
            </View>

            {/* Bottom info bar */}
            <View style={s.cellInfoBar}>
              <View style={s.cellInfoLeft}>
                <View style={[s.cellDot, { backgroundColor: getStatusColor(getStatus(cam.id)) }]} />
                <Text style={s.cellName} numberOfLines={1}>{cam.name}</Text>
              </View>
              <View style={s.cellIpRow}>
                <Feather name="globe" size={9} color={C.textMuted} />
                <Text style={s.cellIp} numberOfLines={1}> {cam.ip}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Bottom bar ── */}
      <View style={s.bottomBar}>
        <View style={s.bottomLeft}>
          <View style={[s.bottomDot, { backgroundColor: C.online }]} />
          <Feather name="video" size={13} color={C.online} style={{ marginLeft: 6 }} />
          <Text style={[s.bottomText, { color: C.online }]}> {cameras.length} caméras en direct</Text>
        </View>
        <TouchableOpacity style={s.singleViewBtn} onPress={() => router.back()}>
          <Feather name="monitor" size={13} color="#fff" />
          <Text style={s.singleViewText}> Vue simple</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
};

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ───────────────────────────────────────────────
  header:          { backgroundColor: C.surface, overflow: 'hidden' },
  headerAccentBar: { height: 3, backgroundColor: C.accentGlow },
  headerInner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 44, paddingBottom: 14 },
  headerCenter:    { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 10 },
  headerTitle:     { color: C.textPrimary, fontSize: 17, fontWeight: '700' },
  headerSub:       { color: C.textMuted, fontSize: 11, marginTop: 1 },
  iconBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  layoutBtns:      { flexDirection: 'row', gap: 6 },
  layoutBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  layoutBtnActive: { backgroundColor: C.accent, borderColor: C.accent },

  // ── Status pill ──────────────────────────────────────────
  statusPill:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  statusPillSm: { paddingHorizontal: 5, paddingVertical: 2 },
  statusPillText: { fontSize: 9, fontWeight: '700' },

  // ── Focus view ───────────────────────────────────────────
  focusedWrap:    { height: 200, margin: 10, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: C.accentGlow, position: 'relative' },
  focusedVideo:   { width: '100%', height: '100%' },
  focusedTopBar:  { position: 'absolute', top: 10, left: 10, gap: 6 },
  focusedNamePill:{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: C.borderGlass },
  focusedNameText:{ color: C.textPrimary, fontSize: 11, fontWeight: '700' },
  focusedCloseBar:{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 8, gap: 4 },
  focusedCloseText:{ color: C.textMuted, fontSize: 12 },

  // ── Grid / List ──────────────────────────────────────────
  gridContent: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 },
  listContent: { padding: 8, gap: 10 },

  gridCell:        { width: CELL_SIZE, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.cellBg },
  gridCellFocused: { borderColor: C.accentGlow, borderWidth: 2 },
  listCell:        { width: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.cellBg },

  gridVideo: { width: CELL_SIZE, height: CELL_SIZE * 0.65 },
  listVideo: { width: '100%', height: 210 },

  // ── Cell overlays ────────────────────────────────────────
  cellTopOverlay: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 5 },
  focusBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(27,79,216,0.85)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  focusBadgeText: { color: '#fff', fontSize: 8, fontWeight: '700' },

  // ── Cell info bar ────────────────────────────────────────
  cellInfoBar:  { backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 6 },
  cellInfoLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cellDot:      { width: 6, height: 6, borderRadius: 3 },
  cellName:     { color: C.textPrimary, fontSize: 10, fontWeight: '700', flex: 1 },
  cellIpRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  cellIp:       { color: C.textMuted, fontSize: 9 },

  // ── Bottom bar ───────────────────────────────────────────
  bottomBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 26, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  bottomLeft:     { flexDirection: 'row', alignItems: 'center' },
  bottomDot:      { width: 7, height: 7, borderRadius: 4 },
  bottomText:     { fontSize: 12, fontWeight: '700' },
  singleViewBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, gap: 4 },
  singleViewText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default GridCameraScreen;