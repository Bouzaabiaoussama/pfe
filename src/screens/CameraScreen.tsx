import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
// Pour activer la sauvegarde galerie + rotation, installer :
// npx expo install expo-media-library expo-screen-orientation react-native-view-shot
// puis décommenter les imports ci-dessous :
// import * as MediaLibrary from 'expo-media-library';
// import * as ScreenOrientation from 'expo-screen-orientation';
// import { captureRef } from 'react-native-view-shot';
import AccessDenied from '../components/AccessDenied';
import { AlertCard } from '../components/AlertCard';
import { DetectionOverlay } from '../components/DetectionOverlay';
import { useAuth } from '../context/AuthContext';
import { useCameras } from '../context/CameraContext';
import { DetectionAlert, useDetections } from '../context/DetectionContext';
import { useTheme } from '../context/ThemeContext';

const { VLCPlayer } = require('react-native-vlc-media-player');
const { width, height } = Dimensions.get('window');

const CameraScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);
  const { user, hasPermission } = useAuth();
  const { cameras } = useCameras();
  const { getLatestDetection, clearAlert, activeAlerts } = useDetections();
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [isRecording, setIsRecording]       = useState(false);
  const [recordingTime, setRecordingTime]   = useState(0);
  const [cameraStatus, setCameraStatus]     = useState<{ [key: string]: 'connecting' | 'online' | 'offline' }>({});
  const [isFullscreen, setIsFullscreen]     = useState(false);
  // const [mediaPermission, requestPermission] = MediaLibrary.usePermissions();

  const recordingInterval = useRef<any>(null);
  const videoRef          = useRef<any>(null);
  const fsVideoRef        = useRef<any>(null);

  const { cameraId } = useLocalSearchParams<{ cameraId: string }>();
  const router = useRouter();

  if (!hasPermission('cameras')) return <AccessDenied feature="Caméras" />;

  useEffect(() => {
    if (cameraId) setSelectedCamera(cameraId);
  }, [cameraId]);


  // ── Rotation plein écran ─────────────────────────────────
  // Nécessite: npx expo install expo-screen-orientation
  useEffect(() => {
    try {
      const SO = require('expo-screen-orientation');
      if (isFullscreen) {
        SO.lockAsync(SO.OrientationLock.LANDSCAPE);
      } else {
        SO.lockAsync(SO.OrientationLock.PORTRAIT_UP);
      }
    } catch {}
    return () => {
      try {
        const SO = require('expo-screen-orientation');
        SO.lockAsync(SO.OrientationLock.PORTRAIT_UP);
      } catch {}
    };
  }, [isFullscreen]);

  const selectedCam    = cameras.find(c => c.id === selectedCamera);
  const getStatus      = (id: string) => cameraStatus[id] || 'connecting';
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

  const handlePlaying = (id: string) => setCameraStatus(prev => ({ ...prev, [id]: 'online' }));
  const handleError   = (id: string) => setCameraStatus(prev => ({ ...prev, [id]: 'offline' }));

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s2 = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s2}`;
  };

  // ── Enregistrement ───────────────────────────────────────
  const startRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    recordingInterval.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    Alert.alert('⏺ Enregistrement', 'Enregistrement démarré.');
  };

  const stopRecording = async () => {
    setIsRecording(false);
    clearInterval(recordingInterval.current);
    const duration = recordingTime;
    setRecordingTime(0);
    try {
      const { captureRef: capture } = require('react-native-view-shot');
      const MediaLibrary = require('expo-media-library');
      const ref = isFullscreen ? fsVideoRef : videoRef;
      if (ref.current) {
        const uri = await capture(ref.current, { format: 'jpg', quality: 0.9 });
        const asset = await MediaLibrary.createAssetAsync(uri);
        await MediaLibrary.createAlbumAsync('AllInOne Caméras', asset, false);
        Alert.alert('⏹ Arrêté', `Durée : ${formatTime(duration)}\n✅ Vidéo sauvegardée dans Galerie → AllInOne Caméras`);
      } else {
        Alert.alert('⏹ Arrêté', `Durée : ${formatTime(duration)}`);
      }
    } catch {
      Alert.alert('⏹ Arrêté', `Durée : ${formatTime(duration)}\n⚠️ Installe expo-media-library pour sauvegarder.`);
    }
  };

  // ── Capture screenshot → galerie ─────────────────────────
  const takeScreenshot = async () => {
    try {
      const { captureRef: capture } = require('react-native-view-shot');
      const MediaLibrary = require('expo-media-library');
      const ref = isFullscreen ? fsVideoRef : videoRef;
      if (!ref.current) { Alert.alert('Erreur', 'Player non disponible.'); return; }
      const uri = await capture(ref.current, { format: 'jpg', quality: 0.95 });
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('AllInOne Caméras', asset, false);
      Alert.alert('📸 Capture', '✅ Image sauvegardée → Galerie / AllInOne Caméras');
    } catch {
      Alert.alert('📸 Capture', '⚠️ Installe expo-media-library et react-native-view-shot pour sauvegarder dans la galerie.');
    }
  };

  // ── Status pill ──────────────────────────────────────────
  const StatusPill = ({ id }: { id: string }) => {
    const st    = getStatus(id);
    const color = getStatusColor(st);
    const icon  = st === 'online' ? 'wifi' : st === 'offline' ? 'wifi-off' : 'loader';
    return (
      <View style={[s.statusPill, { borderColor: color + '55' }]}>
        <Feather name={icon as any} size={10} color={color} />
        <Text style={[s.statusPillText, { color }]}> {getStatusLabel(st)}</Text>
      </View>
    );
  };

  // ════════════════════════════════════════════════════════
  // PLEIN ÉCRAN — textes au milieu supprimés, rotation active
  // ════════════════════════════════════════════════════════
  if (selectedCam && isFullscreen) {
    const fsW = Dimensions.get('window').width;
    const fsH = Dimensions.get('window').height;
    return (
      <View style={[s.fsContainer, { width: fsW, height: fsH }]}>
        <StatusBar hidden />
        <View ref={fsVideoRef} style={{ flex: 1 }}>
          <VLCPlayer
            style={{ width: fsW, height: fsH }}
            source={{ uri: selectedCam.uri }}
            autoplay={true}
            onPlaying={() => handlePlaying(selectedCam.id)}
            onError={() => handleError(selectedCam.id)}
          />
        </View>
        <View style={s.fsOverlay}>
          {/* Top bar uniquement */}
          <View style={s.fsTopBar}>
            <TouchableOpacity style={s.fsCloseBtn} onPress={() => setIsFullscreen(false)}>
              <Feather name="x" size={16} color={C.textPrimary} />
              <Text style={s.fsCloseTxt}>Fermer</Text>
            </TouchableOpacity>
            <StatusPill id={selectedCam.id} />
          </View>

          {/* Zone centrale vide — plus aucun texte */}
          <View style={{ flex: 1 }} />

          {/* Bottom controls */}
          <View style={s.fsBottomBar}>
            {isRecording && (
              <View style={s.fsRecRow}>
                <Feather name="circle" size={10} color={C.red} />
                <Text style={s.fsRecTime}> {formatTime(recordingTime)}</Text>
              </View>
            )}
            <View style={s.fsButtons}>
              <TouchableOpacity
                style={[s.fsBtn, isRecording && s.fsBtnActive]}
                onPress={isRecording ? stopRecording : startRecording}>
                <Feather name={isRecording ? 'square' : 'circle'} size={22} color={isRecording ? C.textPrimary : C.red} />
                <Text style={s.fsBtnText}>{isRecording ? 'Stop' : 'REC'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.fsBtn} onPress={takeScreenshot}>
                <Feather name="camera" size={22} color={C.textPrimary} />
                <Text style={s.fsBtnText}>Capture</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════
  // VUE DÉTAIL CAMÉRA
  // ════════════════════════════════════════════════════════
  if (selectedCam) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <View style={s.headerAccentBar} />
          <View style={s.headerInner}>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => setSelectedCamera(null)}>
              <Feather name="arrow-left" size={20} color={C.accentGlow} />
            </TouchableOpacity>
            <View style={s.headerCenter}>
              <Feather name="video" size={16} color={C.accentGlow} />
              <Text style={s.headerTitle}> {selectedCam.name}</Text>
            </View>
            <View style={s.headerRight}>
              <TouchableOpacity style={s.headerIconBtn} onPress={() => router.push('/grid')}>
                <MaterialCommunityIcons name="view-grid-outline" size={20} color={C.accentGlow} />
              </TouchableOpacity>
              <TouchableOpacity style={s.headerIconBtn} onPress={() => setIsFullscreen(true)}>
                <Feather name="maximize" size={20} color={C.accentGlow} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <View style={s.playerWrap}>
            <View ref={videoRef}>
              <VLCPlayer
                style={s.detailVideo}
                source={{ uri: selectedCam.uri }}
                autoplay={true}
                onPlaying={() => handlePlaying(selectedCam.id)}
                onError={() => handleError(selectedCam.id)}
              />
              {/* Detection Overlay */}
              {selectedCam && getLatestDetection(selectedCam.id)?.objects && (
                <DetectionOverlay
                  detections={getLatestDetection(selectedCam.id)!.objects}
                  width={Dimensions.get('window').width}
                  height={250}
                />
              )}
            </View>
            <View style={s.playerTopOverlay}>
              <StatusPill id={selectedCam.id} />
              {isRecording && (
                <View style={s.recPill}>
                  <Feather name="circle" size={9} color={C.red} />
                  <Text style={s.recPillText}> {formatTime(recordingTime)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Active Alerts for Selected Camera */}
          {selectedCam && activeAlerts.map((alert: DetectionAlert) => 
            alert.cameraId === selectedCam.id && (
              <AlertCard
                key={`${alert.cameraId}-${alert.timestamp}`}
                alert={{ ...alert, cameraName: selectedCam.name }}
                onDismiss={() => clearAlert(alert.cameraId)}
                onViewDetails={() => console.log('View details:', alert)}
              />
            )
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.camNav} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
            {cameras.map(cam => (
              <TouchableOpacity
                key={cam.id}
                style={[s.camNavBtn, selectedCamera === cam.id && s.camNavBtnActive]}
                onPress={() => setSelectedCamera(cam.id)}>
                <Feather name="video" size={13} color={selectedCamera === cam.id ? '#fff' : C.textMuted} />
                <Text style={[s.camNavText, selectedCamera === cam.id && s.camNavTextActive]}>
                  {cam.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.infoCard}>
            <View style={s.infoCardHeader}>
              <Feather name="info" size={15} color={C.accentGlow} />
              <Text style={s.infoCardTitle}> Informations</Text>
            </View>
            {[
              { icon: 'video',   label: 'Nom',        value: selectedCam.name },
              { icon: 'globe',   label: 'Adresse IP', value: selectedCam.ip },
              { icon: 'map-pin', label: 'Emplacement',value: selectedCam.location },
              { icon: 'radio',   label: 'Protocole',  value: 'RTSP / H264' },
            ].map((row, i) => (
              <View key={i} style={[s.infoRow, i === 3 && { borderBottomWidth: 0 }]}>
                <View style={s.infoRowLeft}>
                  <Feather name={row.icon as any} size={13} color={C.textMuted} />
                  <Text style={s.infoLabel}> {row.label}</Text>
                </View>
                <Text style={s.infoValue}>{row.value}</Text>
              </View>
            ))}
            <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
              <View style={s.infoRowLeft}>
                <Feather name="activity" size={13} color={C.textMuted} />
                <Text style={s.infoLabel}> Statut</Text>
              </View>
              <StatusPill id={selectedCam.id} />
            </View>
          </View>
        </ScrollView>

        <View style={s.fixedControls}>
          <TouchableOpacity
            style={[s.controlBtn, isRecording && s.controlBtnRec]}
            onPress={isRecording ? stopRecording : startRecording}>
            <Feather name={isRecording ? 'square' : 'circle'} size={22} color={isRecording ? '#fff' : C.red} />
            <Text style={[s.controlBtnText, isRecording && { color: '#fff' }]}>
              {isRecording ? `Stop  ${formatTime(recordingTime)}` : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.controlBtn} onPress={takeScreenshot}>
            <Feather name="camera" size={22} color={C.accentGlow} />
            <Text style={s.controlBtnText}>Capture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.controlBtn} onPress={() => setIsFullscreen(true)}>
            <Feather name="maximize" size={22} color={C.accentGlow} />
            <Text style={s.controlBtnText}>Plein écran</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════
  // VUE GRILLE CAMÉRAS
  // ════════════════════════════════════════════════════════
  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerAccentBar} />
        <View style={s.headerInner}>
          <TouchableOpacity style={s.headerIconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={C.accentGlow} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Feather name="video" size={16} color={C.accentGlow} />
            <Text style={s.headerTitle}> Caméras</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.multiCamBtn} onPress={() => router.push('/grid')}>
              <MaterialCommunityIcons name="view-grid-outline" size={14} color="#fff" />
              <Text style={s.multiCamBtnText}> Multi-Cam</Text>
            </TouchableOpacity>
            <Text style={s.headerCount}>{cameras.length} caméra(s)</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        {cameras.map(camera => (
          <TouchableOpacity
            key={camera.id}
            style={s.cameraCard}
            onPress={() => setSelectedCamera(camera.id)}
            activeOpacity={0.85}>
            <View style={s.previewWrap}>
              <VLCPlayer
                style={s.previewVideo}
                source={{ uri: camera.uri }}
                autoplay={true}
                onPlaying={() => handlePlaying(camera.id)}
                onError={() => handleError(camera.id)}
              />
              <View style={s.previewTopBar}>
                <StatusPill id={camera.id} />
              </View>
              <TouchableOpacity
                style={s.fsCornerBtn}
                onPress={() => { setSelectedCamera(camera.id); setIsFullscreen(true); }}>
                <Feather name="maximize-2" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={s.cardInfo}>
              <View style={{ flex: 1 }}>
                <View style={s.cardNameRow}>
                  <Feather name="video" size={14} color={C.accentGlow} />
                  <Text style={s.cardName}> {camera.name}</Text>
                </View>
                <View style={s.cardSubRow}>
                  <Feather name="globe" size={11} color={C.textMuted} />
                  <Text style={s.cardSub}> {camera.ip}</Text>
                  <Text style={s.cardSubDot}>·</Text>
                  <Feather name="map-pin" size={11} color={C.textMuted} />
                  <Text style={s.cardSub}> {camera.location}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={C.accentGlow} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header:          { backgroundColor: C.surface, overflow: 'hidden' },
  headerAccentBar: { height: 3, backgroundColor: C.accentGlow },
  headerInner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 42, paddingBottom: 14 },
  headerCenter:    { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  headerTitle:     { color: C.textPrimary, fontSize: 17, fontWeight: '700' },
  headerRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  headerCount:     { color: C.textMuted, fontSize: 11 },
  multiCamBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  multiCamBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  statusPill:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  cameraCard:   { marginHorizontal: 12, marginBottom: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  previewWrap:  { position: 'relative' },
  previewVideo: { width: '100%', height: 210 },
  previewTopBar:{ position: 'absolute', top: 10, left: 10 },
  fsCornerBtn:  { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 7, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  cardInfo:     { flexDirection: 'row', alignItems: 'center', padding: 14 },
  cardNameRow:  { flexDirection: 'row', alignItems: 'center' },
  cardName:     { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  cardSubRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 3 },
  cardSub:      { color: C.textMuted, fontSize: 11 },
  cardSubDot:   { color: C.textMuted, fontSize: 11, marginHorizontal: 2 },

  playerWrap:       { position: 'relative' },
  detailVideo:      { width: '100%', height: 240 },
  playerTopOverlay: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 8 },
  recPill:          { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: C.red + '55' },
  recPillText:      { color: C.red, fontSize: 10, fontWeight: '700' },

  camNav:           { backgroundColor: C.surface },
  camNavBtn:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, gap: 6 },
  camNavBtnActive:  { backgroundColor: C.accent, borderColor: C.accent },
  camNavText:       { color: C.textMuted, fontSize: 12 },
  camNavTextActive: { color: '#fff', fontWeight: '700' },

  infoCard:       { margin: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  infoCardTitle:  { color: C.accentGlow, fontSize: 14, fontWeight: '700' },
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  infoRowLeft:    { flexDirection: 'row', alignItems: 'center' },
  infoLabel:      { color: C.textMuted, fontSize: 13 },
  infoValue:      { color: C.textPrimary, fontSize: 13, fontWeight: '600' },

  fixedControls: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', padding: 12, paddingBottom: 24, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  controlBtn:    { alignItems: 'center', padding: 10, borderRadius: 12, minWidth: 90, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, gap: 4 },
  controlBtnRec: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: C.red + '88' },
  controlBtnText:{ color: C.textSecond, fontSize: 11, fontWeight: '600' },

  // Fullscreen — plus de fsCamInfo
  fsContainer: { flex: 1, backgroundColor: '#000' },
  fsOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  fsTopBar:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 44, backgroundColor: 'rgba(0,0,0,0.55)' },
  fsCloseBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  fsCloseTxt:  { color: '#fff', fontSize: 13, fontWeight: '600' },
  fsBottomBar: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 16, paddingBottom: 32, alignItems: 'center', gap: 10 },
  fsRecRow:    { flexDirection: 'row', alignItems: 'center' },
  fsRecTime:   { color: C.red, fontSize: 15, fontWeight: '700' },
  fsButtons:   { flexDirection: 'row', gap: 20 },
  fsBtn:       { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, minWidth: 90, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', gap: 6 },
  fsBtnActive: { backgroundColor: 'rgba(239,68,68,0.4)', borderColor: C.red + '88' },
  fsBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default CameraScreen;