import { useRouter } from 'expo-router';
import { ref, set, onValue, off } from 'firebase/database';
import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { database } from '@/firebase';
import { useAuth } from '../context/AuthContext';
import AccessDenied from '../components/AccessDenied';
import { useTheme } from '../context/ThemeContext';

type DoorStatus = 'open' | 'closed' | 'moving';
type Door = {
  id: string; name: string; location: string;
  status: DoorStatus; relay: string; device: string;
  firebasePath?: string;
};

const AccessScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);
  const router = useRouter();
  const { hasPermission } = useAuth();
  if (!hasPermission('access')) return <AccessDenied feature="Contrôle Accès" />;

  const [raspberryConnected, setRaspberryConnected] = useState(false);
  const [raspberryChecked,   setRaspberryChecked]   = useState(false);

  const [doors, setDoors] = useState<Door[]>([
    { id: '1', name: 'Porte principale', location: 'Entrée maison', status: 'closed', relay: 'Relais 1', device: 'Raspberry Pi', firebasePath: 'devices/raspberry/doors/door1' },
    { id: '2', name: 'Porte garage',     location: 'Garage',        status: 'closed', relay: 'Relais 2', device: 'ESP32' },
    { id: '3', name: 'Fenêtre salon',    location: 'Salon',         status: 'closed', relay: 'Relais 3', device: 'ESP32' },
  ]);

  useEffect(() => {
    const door1Ref = ref(database, 'devices/raspberry/doors/door1');
    const statusRef = ref(database, 'devices/raspberry/connected');

    const unsubDoor = onValue(door1Ref, (snap) => {
      const data = snap.val();
      if (data !== null) {
        const st: DoorStatus = data.state === 'open' ? 'open' : 'closed';
        setDoors(prev => prev.map(d => d.id === '1' ? { ...d, status: st } : d));
      }
    });

    const unsubStatus = onValue(statusRef, (snap) => {
      setRaspberryConnected(snap.val() === true);
      setRaspberryChecked(true);
    });

    return () => { off(door1Ref); off(statusRef); };
  }, []);

  const handleToggleRaspberry = async (door: Door) => {
    if (door.status === 'moving') return;
    if (!raspberryConnected) {
      Alert.alert('Raspberry Pi déconnecté', "Impossible d'envoyer la commande.", [{ text: 'OK' }]);
      return;
    }
    const newState = door.status === 'closed' ? 'open' : 'closed';
    setDoors(prev => prev.map(d => d.id === door.id ? { ...d, status: 'moving' } : d));
    try {
      await set(ref(database, `${door.firebasePath}/command`), { action: newState, timestamp: Date.now() });
    } catch {
      Alert.alert('Erreur Firebase', "Impossible d'envoyer la commande.");
      setDoors(prev => prev.map(d => d.id === door.id ? { ...d, status: door.status } : d));
    }
  };

  const handleToggleLocal = (id: string) => {
    const door = doors.find(d => d.id === id);
    if (!door || door.status === 'moving') return;
    setDoors(prev => prev.map(d => d.id === id ? { ...d, status: 'moving' } : d));
    setTimeout(() => {
      setDoors(prev => prev.map(d => d.id === id ? { ...d, status: door.status === 'closed' ? 'open' : 'closed' } : d));
    }, 1500);
  };

  const handleToggle = (door: Door) => {
    if (door.firebasePath) handleToggleRaspberry(door);
    else handleToggleLocal(door.id);
  };

  const getStatusConfig = (status: DoorStatus) => {
    switch (status) {
      case 'open':   return { label: 'OUVERTE',     color: C.warn,   bg: `${C.warn}20`   };
      case 'closed': return { label: 'FERMÉE',      color: C.online, bg: `${C.online}20` };
      case 'moving': return { label: 'EN COURS...', color: C.cyan,   bg: `${C.cyan}20`   };
    }
  };

  const getDoorIcon = (door: Door): React.ComponentProps<typeof Feather>['name'] => {
    if (door.name.toLowerCase().includes('fenêtre') || door.name.toLowerCase().includes('fenetre')) return 'square';
    if (door.name.toLowerCase().includes('garage')) return 'home';
    return 'lock';
  };

  const openCount   = doors.filter(d => d.status === 'open').length;
  const closedCount = doors.filter(d => d.status === 'closed').length;

  // Raspberry status display
  const raspStatusColor = !raspberryChecked ? C.textMuted : raspberryConnected ? C.online : C.offline;
  const raspStatusLabel = !raspberryChecked
    ? 'Vérification...'
    : raspberryConnected ? 'Raspberry connecté' : 'Raspberry déconnecté';

  return (
    <ScrollView style={s.root} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerAccentBar} />
        <View style={s.headerInner}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={C.accentGlow} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={s.headerTitleRow}>
              <Feather name="shield" size={17} color={C.accentGlow} />
              <Text style={s.headerTitle}> Contrôle Accès</Text>
            </View>
            <Text style={s.headerSub}>Portes · Garage · Fenêtres</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { val: closedCount,  label: 'Fermées',  color: C.online,     icon: 'lock'   as const },
          { val: openCount,    label: 'Ouvertes', color: C.warn,       icon: 'unlock' as const },
          { val: doors.length, label: 'Total',    color: C.accentGlow, icon: 'layers' as const },
        ].map((item, i) => (
          <View key={i} style={[s.statCard, { borderTopColor: item.color }]}>
            <Feather name={item.icon} size={16} color={item.color} style={{ marginBottom: 4 }} />
            <Text style={[s.statNum, { color: item.color }]}>{item.val}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <Text style={s.sectionTitle}>Accès disponibles</Text>

      {doors.map(door => {
        const conf     = getStatusConfig(door.status);
        const isOpen   = door.status === 'open';
        const isMoving = door.status === 'moving';
        const isRasp   = !!door.firebasePath;
        const disabled = isMoving || (isRasp && (!raspberryChecked || !raspberryConnected));

        return (
          <View key={door.id} style={[s.doorCard, { borderLeftColor: conf.color }]}>
            {/* Top */}
            <View style={s.doorTop}>
              <View style={[s.doorIconBox, { backgroundColor: conf.bg, borderColor: `${conf.color}44` }]}>
                <Feather name={getDoorIcon(door)} size={24} color={conf.color} />
              </View>
              <View style={s.doorInfo}>
                <Text style={s.doorName}>{door.name}</Text>
                <View style={s.doorSubRow}>
                  <Feather name="map-pin" size={11} color={C.textMuted} />
                  <Text style={s.doorSub}> {door.location}</Text>
                </View>
                <View style={s.doorSubRow}>
                  <Feather name="cpu" size={11} color={C.textMuted} />
                  <Text style={s.doorSub}> {door.relay} · {door.device}</Text>
                </View>
                {isRasp && (
                  <View style={s.deviceBadge}>
                    <View style={[s.deviceDot, { backgroundColor: raspStatusColor }]} />
                    <Text style={[s.deviceBadgeText, { color: raspStatusColor }]}>
                      {raspStatusLabel}
                    </Text>
                  </View>
                )}
              </View>
              <View style={[s.statusBadge, { backgroundColor: conf.bg, borderColor: `${conf.color}55` }]}>
                <View style={[s.statusDot, { backgroundColor: conf.color }]} />
                <Text style={[s.statusBadgeText, { color: conf.color }]}>{conf.label}</Text>
              </View>
            </View>

            {/* Toggle button */}
            <TouchableOpacity
              style={[
                s.toggleBtn,
                isOpen   && { backgroundColor: `${C.warn}20`,    borderColor: `${C.warn}66`    },
                isMoving && { backgroundColor: `${C.cyan}18`,    borderColor: `${C.cyan}66`    },
                disabled && !isMoving && { backgroundColor: `${C.textMuted}10`, borderColor: C.border },
              ]}
              onPress={() => handleToggle(door)}
              disabled={disabled}
              activeOpacity={0.8}
            >
              {isMoving ? (
                <><Feather name="loader" size={18} color={C.cyan} /><Text style={[s.toggleBtnText, { color: C.cyan }]}>En cours...</Text></>
              ) : disabled ? (
                <><Feather name="slash" size={18} color={C.textMuted} /><Text style={[s.toggleBtnText, { color: C.textMuted }]}>Non disponible</Text></>
              ) : isOpen ? (
                <><Feather name="lock" size={18} color={C.warn} /><Text style={[s.toggleBtnText, { color: C.warn }]}>Fermer</Text></>
              ) : (
                <><Feather name="unlock" size={18} color={C.online} /><Text style={[s.toggleBtnText, { color: C.online }]}>Ouvrir</Text></>
              )}
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Info card */}
      <View style={s.infoCard}>
        <View style={s.infoTitleRow}>
          <Feather name="info" size={14} color={C.accentGlow} />
          <Text style={s.infoTitle}> Information</Text>
        </View>
        <Text style={s.infoText}>
          La porte principale est contrôlée via Raspberry Pi + Firebase.{'\n'}
          Les autres portes utilisent les relais ESP32.
        </Text>
        {[
          { color: raspStatusColor, label: !raspberryChecked ? 'Raspberry Pi · Vérification...' : raspberryConnected ? 'Raspberry Pi · Connecté' : 'Raspberry Pi · Non connecté' },
          { color: C.textMuted,     label: 'ESP32 · Non connecté' },
        ].map((item, i) => (
          <View key={i} style={[s.deviceStatusRow, i > 0 && { marginTop: 6 }]}>
            <View style={[s.deviceDot, { backgroundColor: item.color }]} />
            <Text style={s.deviceStatusText}>{item.label}</Text>
          </View>
        ))}
        <View style={s.firebasePath}>
          <Feather name="radio" size={11} color={C.textMuted} />
          <Text style={s.firebasePathLabel}> Firebase path : </Text>
          <Text style={s.firebasePathValue}>devices/raspberry/doors/door1</Text>
        </View>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
};

const makeStyles = (C: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.surface, overflow: 'hidden' },
  headerAccentBar: { height: 3, backgroundColor: C.accentGlow },
  headerInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 44, paddingBottom: 14 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: C.textPrimary, fontSize: 20, fontWeight: '700' },
  headerSub: { color: C.textMuted, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 2.5, borderWidth: 1, borderColor: C.border },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  sectionTitle: { color: C.textPrimary, fontSize: 11, fontWeight: '700', paddingHorizontal: 14, paddingBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
  doorCard: { marginHorizontal: 12, marginBottom: 10, backgroundColor: C.surface, borderRadius: 16, padding: 16, borderLeftWidth: 3, borderWidth: 1, borderColor: C.border },
  doorTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  doorIconBox: { width: 50, height: 50, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  doorInfo: { flex: 1 },
  doorName: { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  doorSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  doorSub: { color: C.textMuted, fontSize: 11 },
  deviceBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 5 },
  deviceDot: { width: 6, height: 6, borderRadius: 3 },
  deviceBadgeText: { fontSize: 11, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1, gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  toggleBtn: { backgroundColor: `${C.online}18`, borderColor: `${C.online}55`, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  toggleBtnText: { fontSize: 14, fontWeight: '700' },
  infoCard: { marginHorizontal: 12, marginTop: 4, backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  infoTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoTitle: { color: C.accentGlow, fontSize: 14, fontWeight: '700' },
  infoText: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  deviceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  deviceStatusText: { color: C.textSecond, fontSize: 12 },
  firebasePath: { flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: `${C.accentGlow}08` },
  firebasePathLabel: { color: C.textMuted, fontSize: 11 },
  firebasePathValue: { color: C.accentGlow, fontSize: 11, fontFamily: 'monospace' },
});

export default AccessScreen;