import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ref, set, onValue, off } from 'firebase/database';
import { database } from '@/firebase';
import { useAuth } from '../context/AuthContext';
import AccessDenied from '../components/AccessDenied';
import { useTheme } from '../context/ThemeContext';

type LightStatus = 'on' | 'off';
type Light = {
  id: string; name: string; location: string;
  status: LightStatus; relay: string; device: string;
  color: string; firebasePath?: string;
};

const LightsScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);
  const { hasPermission } = useAuth();
  if (!hasPermission('lights')) return <AccessDenied feature="Lumières" />;

  const router = useRouter();
  const [raspberryConnected, setRaspberryConnected] = useState(false);
  const [raspberryChecked,   setRaspberryChecked]   = useState(false);

  const [lights, setLights] = useState<Light[]>([
    { id: '1', name: 'Lumière Salon',   location: 'Salon',              status: 'off', relay: 'Relais 1', device: 'Raspberry Pi', color: C.warn,       firebasePath: 'devices/raspberry/lights/light1' },
    { id: '2', name: 'Lumière Chambre', location: 'Chambre principale', status: 'off', relay: 'Relais 2', device: 'ESP32',        color: '#FB923C' },
    { id: '3', name: 'Lumière Cuisine', location: 'Cuisine',            status: 'off', relay: 'Relais 3', device: 'ESP32',        color: C.cyan   },
    { id: '4', name: 'Lumière Entrée',  location: 'Entrée principale',  status: 'off', relay: 'Relais 4', device: 'ESP32',        color: C.online },
    { id: '5', name: 'Lumière Garage',  location: 'Garage',             status: 'off', relay: 'Relais 5', device: 'ESP32',        color: '#A78BFA'},
  ]);

  useEffect(() => {
    const light1Ref = ref(database, 'devices/raspberry/lights/light1');
    const statusRef = ref(database, 'devices/raspberry/connected');

    const unsubLight = onValue(light1Ref, (snap) => {
      const data = snap.val();
      if (data !== null) {
        const st: LightStatus = data.state === 'on' ? 'on' : 'off';
        setLights(prev => prev.map(l => l.id === '1' ? { ...l, status: st } : l));
      }
    });

    const unsubStatus = onValue(statusRef, (snap) => {
      setRaspberryConnected(snap.val() === true);
      setRaspberryChecked(true);
    });

    return () => { off(light1Ref); off(statusRef); };
  }, []);

  const handleToggleRaspberry = async (light: Light) => {
    if (!raspberryConnected) {
      Alert.alert('Raspberry Pi déconnecté', "Impossible d'envoyer la commande.", [{ text: 'OK' }]);
      return;
    }
    const newState: LightStatus = light.status === 'on' ? 'off' : 'on';
    setLights(prev => prev.map(l => l.id === light.id ? { ...l, status: newState } : l));
    try {
      await set(ref(database, `${light.firebasePath}/command`), { action: newState, timestamp: Date.now() });
    } catch {
      Alert.alert('Erreur Firebase', "Impossible d'envoyer la commande.");
      setLights(prev => prev.map(l => l.id === light.id ? { ...l, status: light.status } : l));
    }
  };

  const toggleLight = (id: string) => {
    const light = lights.find(l => l.id === id);
    if (!light) return;
    if (light.firebasePath) handleToggleRaspberry(light);
    else setLights(prev => prev.map(l => l.id === id ? { ...l, status: l.status === 'on' ? 'off' : 'on' } : l));
  };

  const onCount  = lights.filter(l => l.status === 'on').length;
  const offCount = lights.filter(l => l.status === 'off').length;

  // Helper — raspberry status display
  const raspStatusColor = !raspberryChecked ? C.textMuted : raspberryConnected ? C.online : C.offline;
  const raspStatusLabel = !raspberryChecked ? 'Vérification...' : raspberryConnected ? 'Raspberry connecté' : 'Raspberry déconnecté';

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
              <Ionicons name="bulb-outline" size={18} color={C.accentGlow} />
              <Text style={s.headerTitle}> Contrôle Lumières</Text>
            </View>
            <Text style={s.headerSub}>ESP32 · Relais intelligents</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { val: onCount,       label: 'Allumées', color: C.warn,       icon: 'bulb'        as any, lib: 'Ionicons' },
          { val: offCount,      label: 'Éteintes', color: C.textMuted,  icon: 'bulb-outline'as any, lib: 'Ionicons' },
          { val: lights.length, label: 'Total',    color: C.accentGlow, icon: 'layers'      as any, lib: 'Feather'  },
        ].map((item, i) => (
          <View key={i} style={[s.statCard, { borderTopColor: item.color }]}>
            {item.lib === 'Ionicons'
              ? <Ionicons name={item.icon} size={18} color={item.color} style={{ marginBottom: 4 }} />
              : <Feather   name={item.icon} size={18} color={item.color} style={{ marginBottom: 4 }} />
            }
            <Text style={[s.statNum, { color: item.color }]}>{item.val}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <Text style={s.sectionTitle}>Lumières disponibles</Text>

      {lights.map(light => {
        const isOn     = light.status === 'on';
        const isRasp   = !!light.firebasePath;
        const disabled = isRasp && (!raspberryChecked || !raspberryConnected);

        return (
          <View key={light.id} style={[s.lightCard, { borderLeftColor: isOn ? light.color : C.border }]}>
            {/* Top row */}
            <View style={s.lightTop}>
              <View style={[s.lightIconBox, { backgroundColor: isOn ? `${light.color}20` : C.surfaceAlt, borderColor: isOn ? `${light.color}55` : C.border }]}>
                <Ionicons name={isOn ? 'bulb' : 'bulb-outline'} size={28} color={isOn ? light.color : C.textMuted} />
              </View>
              <View style={s.lightInfo}>
                <Text style={s.lightName}>{light.name}</Text>
                <View style={s.lightSubRow}>
                  <Feather name="map-pin" size={11} color={C.textMuted} />
                  <Text style={s.lightSub}> {light.location}</Text>
                </View>
                <View style={s.lightSubRow}>
                  <Feather name="cpu" size={11} color={C.textMuted} />
                  <Text style={s.lightSub}> {light.relay} · {light.device}</Text>
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
              <Switch
                value={isOn}
                onValueChange={() => toggleLight(light.id)}
                trackColor={{ false: C.border, true: light.color }}
                thumbColor={isOn ? '#fff' : '#888'}
                disabled={disabled}
              />
            </View>

            {/* Bottom row */}
            <View style={s.lightBottom}>
              <View style={[s.statusPill, { backgroundColor: isOn ? `${light.color}20` : `${C.textMuted}15`, borderColor: isOn ? `${light.color}55` : C.border }]}>
                <View style={[s.statusDot, { backgroundColor: isOn ? light.color : C.textMuted }]} />
                <Text style={[s.statusPillText, { color: isOn ? light.color : C.textMuted }]}>
                  {isOn ? 'ALLUMÉE' : 'ÉTEINTE'}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.toggleBtn, {
                  backgroundColor: disabled ? `${C.textMuted}10` : isOn ? `${C.offline}18` : `${light.color}18`,
                  borderColor:     disabled ? C.border : isOn ? `${C.offline}66` : `${light.color}66`,
                }]}
                onPress={() => toggleLight(light.id)}
                disabled={disabled}
              >
                {disabled
                  ? <Feather name="slash" size={13} color={C.textMuted} />
                  : <Ionicons name={isOn ? 'power' : 'bulb-outline'} size={13} color={isOn ? C.offline : light.color} />
                }
                <Text style={[s.toggleBtnText, { color: disabled ? C.textMuted : isOn ? C.offline : light.color }]}>
                  {disabled ? ' Non disponible' : isOn ? ' Éteindre' : ' Allumer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
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
  lightCard: { marginHorizontal: 12, marginBottom: 10, backgroundColor: C.surface, borderRadius: 16, padding: 16, borderLeftWidth: 3, borderWidth: 1, borderColor: C.border },
  lightTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  lightIconBox: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  lightInfo: { flex: 1 },
  lightName: { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  lightSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  lightSub: { color: C.textMuted, fontSize: 11 },
  deviceBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 5 },
  deviceDot: { width: 6, height: 6, borderRadius: 3 },
  deviceBadgeText: { fontSize: 11, fontWeight: '600' },
  lightBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  toggleBtnText: { fontSize: 12, fontWeight: '700' },
});

export default LightsScreen;