import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onValue, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { AlertCard } from '../components/AlertCard';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCameras } from '../context/CameraContext';
import { DetectionAlert, useDetections } from '../context/DetectionContext';
import { useTheme } from '../context/ThemeContext';

interface ZKDevice {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'unknown';
  userCount?: number;
  lastSync?: string;
}

type QuickItem = {
  label: string;
  sub: string;
  accent: string;
  badge: string;
  badgeBg: string;
  route: string;
  badgeTextDark?: boolean;
  iconName: string;
  iconLib: 'Feather' | 'Ionicons' | 'MaterialCommunity';
  iconColor: string;
};

const DashboardScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);
  const { user, logout } = useAuth();
  const { cameras } = useCameras();
  const { activeAlerts, clearAlert, totalAlerts } = useDetections();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [zkDevices, setZkDevices] = useState<ZKDevice[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(database, 'zkteco_devices'), (snap) => {
      const data = snap.val();
      if (!data) { setZkDevices([]); return; }
      const list: ZKDevice[] = Object.entries(data).map(([id, d]: any) => ({
        id, name: d.name, ip: d.ip,
        status: d.status ?? 'unknown',
        userCount: d.userCount,
        lastSync: d.lastSync,
      }));
      setZkDevices(list);
    });
    return () => unsub();
  }, []);

  const formatDate = (date: Date) => {
    const days   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };
  const formatTime = (date: Date) => date.toTimeString().slice(0, 8);
  const handleLogout = () => { logout(); router.replace('/login'); };
  const handleVoirCamera = (cameraId: string) => router.push({ pathname: '/cameras', params: { cameraId } });
  const getStatusColor = (st: string) => st === 'online' ? C.online : st === 'offline' ? C.offline : C.textMuted;
  const getStatusLabel = (st: string) => st === 'online' ? 'EN LIGNE' : st === 'offline' ? 'HORS LIGNE' : 'INCONNU';

  const quickItems: QuickItem[] = [
    { label: 'Caméras',   sub: `${cameras.length} en direct`,      accent: C.cyan,   badge: `${cameras.length}`, badgeBg: C.cyan,   iconLib: 'Feather',          iconName: 'video',        iconColor: C.cyan,   route: '/cameras'    },
    { label: 'IoT',       sub: 'Capteurs',                          accent: C.pink,   badge: 'LIVE',              badgeBg: C.online, iconLib: 'Feather',          iconName: 'cpu',          iconColor: C.pink,   route: '/iot'         },
    { label: 'Alertes',   sub: `${totalAlerts} active(s)`,         accent: C.warn,   badge: `${totalAlerts}`,   badgeBg: totalAlerts > 0 ? C.offline : C.online, iconLib: 'Feather', iconName: 'bell', iconColor: C.warn, route: '/alerts' },
    { label: 'Accès',     sub: '3 portes',                          accent: C.pink,   badge: 'OK',                badgeBg: C.online, iconLib: 'Feather',          iconName: 'lock',         iconColor: C.pink,   route: '/access'      },
    { label: 'Lumières',  sub: 'Contrôle',                          accent: C.warn,   badge: 'ON',                badgeBg: C.warn,   iconLib: 'Ionicons',         iconName: 'bulb-outline', iconColor: C.warn,   route: '/lights',   badgeTextDark: true },
    { label: 'Pointages', sub: `${zkDevices.length} pointeuse(s)`, accent: C.cyan,   badge: 'LIVE',              badgeBg: C.cyan,   iconLib: 'Feather',          iconName: 'clock',        iconColor: C.cyan,   route: '/attendance', badgeTextDark: true },
  ];

  const renderQuickIcon = (item: QuickItem) => {
    if (item.iconLib === 'Ionicons')
      return <Ionicons name={item.iconName as any} size={28} color={item.iconColor} />;
    if (item.iconLib === 'MaterialCommunity')
      return <MaterialCommunityIcons name={item.iconName as any} size={28} color={item.iconColor} />;
    return <Feather name={item.iconName as any} size={26} color={item.iconColor} />;
  };

  return (
    <ScrollView style={s.root} showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerAccentBar} />
        <View style={s.headerInner}>
          <View>
            <Text style={s.welcome}>Bonjour</Text>
            <Text style={s.username}>{user?.username}</Text>
            <View style={s.rolePill}>
              <Feather
                name={(user?.role as string) === 'admin' ? 'shield' : (user?.role as string) === 'security' ? 'lock' : 'user'}
                size={11} color={C.accentGlow} style={{ marginRight: 5 }}
              />
              <Text style={s.rolePillText}>
                {(user?.role as string) === 'admin' ? 'Administrateur' : (user?.role as string) === 'security' ? 'Sécurité' : 'Utilisateur'}
              </Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View style={s.timeBox}>
              <Text style={s.timeText}>{formatTime(currentTime)}</Text>
              <Text style={s.dateText}>{formatDate(currentTime)}</Text>
            </View>
            <View style={s.headerBtns}>
              <TouchableOpacity style={s.configBtn} onPress={() => router.push('/config')}>
                <Feather name="settings" size={18} color={C.accentGlow} />
              </TouchableOpacity>
              <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
                <MaterialCommunityIcons name="logout" size={18} color={C.offline} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* 🔥 Fire/Smoke Alerts Section */}
      {totalAlerts > 0 && (
        <View>
          <View style={s.alertsHeader}>
            <MaterialCommunityIcons name="fire-alert" size={20} color="#ff4444" />
            <Text style={s.alertsTitle}> Active Alerts ({totalAlerts})</Text>
          </View>
          {activeAlerts.map((alert: DetectionAlert) => (
            <AlertCard
              key={`${alert.cameraId}-${alert.timestamp}`}
              alert={alert}
              onDismiss={() => clearAlert(alert.cameraId)}
              onViewDetails={() => router.push({ pathname: '/cameras', params: { cameraId: alert.cameraId } })}
            />
          ))}
        </View>
      )}

      <View style={s.grid}>
        {quickItems.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={[s.quickCard, { borderColor: item.accent, shadowColor: item.accent }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.75}
          >
            <View style={[s.quickIconBox, { borderColor: item.accent + '40' }]}>
              {renderQuickIcon(item)}
            </View>
            <Text style={s.quickLabel}>{item.label}</Text>
            <Text style={s.quickSub}>{item.sub}</Text>
            <View style={[s.badge, { backgroundColor: item.badgeBg }]}>
              <Text style={[s.badgeText, item.badgeTextDark && { color: '#0A0F2C' }]}>{item.badge}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>





    </ScrollView>
  );
};

const makeStyles = (C: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ── Header ───────────────────────────────────────────────
  header:          { backgroundColor: C.surface, paddingBottom: 20, overflow: 'hidden' },
  headerAccentBar: { height: 3, backgroundColor: C.accentGlow },
  headerInner:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 48 },
  welcome:         { color: C.textMuted, fontSize: 13, letterSpacing: 0.5 },
  username:        { color: C.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 2 },
  rolePill:        { marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(74,144,217,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.borderGlass },
  rolePillText:    { color: C.accentGlow, fontSize: 11, fontWeight: '600' },
  headerRight:     { alignItems: 'flex-end', gap: 10 },
  timeBox:         { alignItems: 'flex-end' },
  timeText:        { color: C.cyan, fontSize: 22, fontWeight: '700', letterSpacing: 1 },
  dateText:        { color: C.textMuted, fontSize: 10, marginTop: 2 },
  headerBtns:      { flexDirection: 'row', gap: 8, marginTop: 4 },
  configBtn:       { backgroundColor: 'rgba(74,144,217,0.15)', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,144,217,0.3)' },
  logoutBtn:       { backgroundColor: 'rgba(248,113,113,0.15)', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)' },

  // ── Section title ─────────────────────────────────────────
  sectionTitle: { color: C.textPrimary, fontSize: 11, fontWeight: '700', paddingHorizontal: 14, paddingTop: 18, paddingBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' },

  // ── Fire/Smoke Alerts ──────────────────────────────────────
  alertsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  alertsTitle: { color: '#ff4444', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  // ── Quick access grid ─────────────────────────────────────
  // CHANGED: borderColor = C.cyan (turquoise glow) + shadowColor = C.cyan
  grid:      { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, justifyContent: 'center' },
  quickCard: {
    width: '46%', margin: '2%', borderRadius: 16, padding: 16,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    minHeight: 140,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.cyan,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 7,
  },
  quickShine:   { position: 'absolute', top: 0, left: 0, right: 0, height: '40%', backgroundColor: 'rgba(255,255,255,0.04)' },
  quickIconBox: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
  quickLabel:   { color: C.textPrimary, fontSize: 13, fontWeight: '700' },
  quickSub:     { color: C.textMuted, fontSize: 11, marginTop: 3 },
  badge:        { position: 'absolute', top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText:    { color: '#fff', fontSize: 9, fontWeight: '700' },

  // ── Generic card ─────────────────────────────────────────
  // CHANGED: même bordure cyan glow sur les cartes ZKTeco et caméras
  card: {
    marginHorizontal: 12, borderRadius: 16, overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.cyan,
    shadowColor: C.cyan,
    shadowOpacity: 0.38,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 6,
  },

  // ── ZKTeco rows ──────────────────────────────────────────
  zkRow:       { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  zkRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  zkIconBox:   { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  zkName:      { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
  zkSubRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  zkSub:       { color: C.textMuted, fontSize: 11 },
  zkStatus:    { alignItems: 'center', gap: 4 },
  zkDot:       { width: 7, height: 7, borderRadius: 4 },
  zkStatusText:{ fontSize: 9, fontWeight: '700' },
  zkAddBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderTopWidth: 1, borderTopColor: C.border },
  zkAddText:   { color: C.accentGlow, fontSize: 13, fontWeight: '600' },

  // ── Camera rows ──────────────────────────────────────────
  camRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  camLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  camOnlineDot:{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.online },
  viewBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(74,144,217,0.18)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.borderGlass },
  viewBtnText: { color: C.accentGlow, fontSize: 12, fontWeight: '700' },
  emptyBox:    { padding: 28, alignItems: 'center' },
  emptyText:   { color: C.textMuted, fontSize: 13 },
});

export default DashboardScreen;