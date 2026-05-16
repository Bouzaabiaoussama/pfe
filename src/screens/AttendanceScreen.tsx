import { useRouter } from 'expo-router';
import { onValue, ref, remove } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, SafeAreaView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { database } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';

interface AttendanceRecord {
  key: string; userId: string; timestampMs: number;
  typeLabel: string; heure: string; date: string;
}
interface ZKUser { name: string; cardNumber: string; role: number; }
interface DayGroup {
  groupKey: string; userId: string; date: string; dateMs: number;
  entree: string | null; debutPause: string | null;
  finPause: string | null; sortie: string | null;
  dureeTotal: string | null; dureePause: string | null;
}

export default function AttendanceScreen() {
  const router = useRouter();
  const C = useTheme();
  const s = makeStyles(C);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users,   setUsers]   = useState<Record<string, ZKUser>>({});
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [tab,     setTab]     = useState<'pointages' | 'employes'>('pointages');
  const [error,   setError]   = useState('');

  useEffect(() => {
    const unsub = onValue(ref(database, 'zkteco_users'), (snap) => setUsers(snap.val() ?? {}));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(database, 'attendance'), (snap) => {
      const data = snap.val();
      if (!data) { setLoading(false); return; }
      const list: AttendanceRecord[] = Object.entries(data).map(([key, val]: any) => ({
        key,
        userId:      String(val.userId ?? ''),
        timestampMs: val.timestampMs ?? 0,
        typeLabel:   val.typeLabel ?? val.type ?? '',
        heure:       val.heure ?? '--:--',
        date:        val.date ?? '--/--/----',
      }));
      list.sort((a, b) => b.timestampMs - a.timestampMs);
      setRecords(list);
      setLoading(false);
    }, (err) => { setError(err.message); setLoading(false); });
    return () => unsub();
  }, []);

  const getName = (userId: string) => {
    if (users[userId]?.name) return users[userId].name;
    const n = parseInt(userId, 10);
    if (!isNaN(n)) {
      if ((users as any)[n]?.name) return (users as any)[n].name;
      if (users[String(n)]?.name) return users[String(n)].name;
    }
    return `Employe #${userId}`;
  };

  const msDiff = (a: number, b: number) => {
    const diff = Math.abs(b - a);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h${m > 0 ? m + 'min' : ''}`;
  };

  // Normalise le typeLabel — supporte accents, ZKTeco raw values, variantes
  const normalizeType = (label: string): 'entree' | 'debut_pause' | 'fin_pause' | 'sortie' | 'unknown' => {
    const l = (label ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (['entree', 'entree', 'check in', 'checkin', 'in', '0'].includes(l)) return 'entree';
    if (['sortie', 'check out', 'checkout', 'out', '1'].includes(l))        return 'sortie';
    if (['debut pause', 'break start', 'pause', '2'].includes(l))           return 'debut_pause';
    if (['fin pause', 'break end', '3'].includes(l))                        return 'fin_pause';
    return 'unknown';
  };

  const buildGroups = (): DayGroup[] => {
    const map: Record<string, AttendanceRecord[]> = {};
    for (const r of records) {
      const gk = `${r.userId}_${r.date}`;
      if (!map[gk]) map[gk] = [];
      map[gk].push(r);
    }
    return Object.entries(map).map(([gk, recs]) => {
      recs.sort((a, b) => a.timestampMs - b.timestampMs);
      // Grouper par type normalise — garde le dernier si doublon
      const byType: Record<string, AttendanceRecord> = {};
      for (const r of recs) {
        const norm = normalizeType(r.typeLabel);
        if (norm !== 'unknown') byType[norm] = r;
      }
      const entreeRec     = byType['entree']      ?? null;
      const debutPauseRec = byType['debut_pause'] ?? null;
      const finPauseRec   = byType['fin_pause']   ?? null;
      const sortieRec     = byType['sortie']      ?? null;
      let dureeTotal: string | null = null;
      if (entreeRec && sortieRec) {
        let diff = sortieRec.timestampMs - entreeRec.timestampMs;
        if (debutPauseRec && finPauseRec) diff -= (finPauseRec.timestampMs - debutPauseRec.timestampMs);
        if (diff > 0) {
          const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
          dureeTotal = `${h}h${m > 0 ? m + 'min' : ''}`;
        }
      }
      return {
        groupKey: gk, userId: gk.split('_')[0],
        date: recs[0]?.date ?? '', dateMs: recs[0]?.timestampMs ?? 0,
        entree: entreeRec?.heure ?? null,
        debutPause: debutPauseRec?.heure ?? null,
        finPause:   finPauseRec?.heure   ?? null,
        sortie:     sortieRec?.heure     ?? null,
        dureeTotal,
        dureePause: debutPauseRec && finPauseRec
          ? msDiff(debutPauseRec.timestampMs, finPauseRec.timestampMs) : null,
      };
    }).sort((a, b) => b.dateMs - a.dateMs);
  };

  const groups           = buildGroups();
  const today            = new Date().toLocaleDateString('fr-FR');
  const todayPresent     = groups.filter(g => g.date === today && g.entree !== null).length;
  const filteredGroups   = groups.filter(g =>
    search === '' || getName(g.userId).toLowerCase().includes(search.toLowerCase()));
  const filteredUsers    = Object.entries(users).filter(([, u]) =>
    search === '' || u.name?.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = (userId: string, name: string) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await remove(ref(database, `zkteco_users/${userId}`)); Alert.alert('OK', `${name} supprime.`); }
        catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  const getStatus = (item: DayGroup) => {
    if (item.entree && item.sortie)
      return { label: 'Journee complete', color: C.green,  bg: `${C.green}18`  };
    if (item.entree && item.debutPause && !item.finPause)
      return { label: 'En pause',         color: C.warn,   bg: `${C.warn}18`   };
    if (item.entree && !item.sortie)
      return { label: 'Present',          color: C.cyan,   bg: `${C.cyan}18`   };
    return   { label: 'Incomplet',        color: C.orange, bg: `${C.orange}18` };
  };

  // Composant step timeline
  const TimeStep = ({ label, value, letter, color }: { label: string; value: string | null; letter: string; color: string }) => (
    <View style={s.timeItem}>
      <View style={[s.timeCircle, { backgroundColor: value ? `${color}25` : C.surfaceAlt, borderColor: value ? `${color}66` : C.border, borderWidth: 1 }]}>
        <Text style={[s.timeCircleText, { color: value ? color : C.textMuted }]}>{letter}</Text>
      </View>
      <Text style={s.timeItemLabel}>{label}</Text>
      <Text style={[s.timeItemValue, { color: value ? color : C.textMuted }]}>{value ?? '--:--'}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerAccentBar} />
        <View style={s.headerInner}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={C.accentGlow} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={s.headerTitleRow}>
              <Feather name="clock" size={16} color={C.accentGlow} />
              <Text style={s.headerTitle}> Pointages</Text>
            </View>
            <Text style={s.headerSub}>ZKTeco K40 · Temps reel</Text>
          </View>
          <View style={s.liveDot}>
            <View style={[s.dot, { backgroundColor: C.green }]} />
            <Text style={[s.liveText, { color: C.green }]}>Live</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {(['pointages', 'employes'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && { borderBottomColor: C.accentGlow }]}
            onPress={() => { setTab(t); setSearch(''); }}
          >
            <Text style={[s.tabText, { color: tab === t ? C.accentGlow : C.textMuted, fontWeight: tab === t ? '700' : '500' }]}>
              {t === 'pointages' ? 'Pointages' : `Employes (${Object.keys(users).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error !== '' && (
        <View style={[s.errorBox, { backgroundColor: C.errorBg, borderLeftColor: C.error }]}>
          <Text style={[s.errorText, { color: C.error }]}> {error}</Text>
        </View>
      )}

      {/* ── TAB POINTAGES ── */}
      {tab === 'pointages' && (
        <>
          <View style={s.statsRow}>
            {[
              { label: "Presents\naujourd'hui", val: todayPresent,                                           color: C.green  },
              { label: 'Total\nemployes',       val: Object.keys(users).length,                              color: C.cyan   },
              { label: "Absents\naujourd'hui",  val: Math.max(0, Object.keys(users).length - todayPresent), color: C.red    },
            ].map((item, i) => (
              <View key={i} style={[s.statCard, { borderTopColor: item.color }]}>
                <Text style={[s.statNum, { color: item.color }]}>{item.val}</Text>
                <Text style={s.statLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <TextInput
            style={s.search}
            placeholder="Rechercher un employe..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={C.accentGlow} />
              <Text style={[s.loadingText, { color: C.textMuted }]}>Chargement...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredGroups}
              keyExtractor={item => item.groupKey}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
              ListEmptyComponent={
                <View style={s.center}>
                  <Text style={{ color: C.textMuted, fontSize: 15 }}>Aucun pointage</Text>
                </View>
              }
              renderItem={({ item }) => {
                const status  = getStatus(item);
                const isToday = item.date === today;
                return (
                  <View style={s.card}>
                    {/* Accent bar couleur statut */}
                    <View style={[s.cardAccentBar, { backgroundColor: status.color }]} />

                    {/* Nom + Date */}
                    <View style={s.cardHeader}>
                      <View style={s.cardNameRow}>
                        <Feather name="user" size={14} color={C.accentGlow} />
                        <Text style={s.cardName} numberOfLines={1}> {getName(item.userId)}</Text>
                      </View>
                      <View style={[s.dateBadge, { backgroundColor: isToday ? `${C.green}20` : `${C.accentGlow}15`, borderColor: isToday ? `${C.green}55` : `${C.accentGlow}44` }]}>
                        <Text style={[s.dateBadgeText, { color: isToday ? C.green : C.accentGlow }]}>
                          {isToday ? "Aujourd'hui" : item.date}
                        </Text>
                      </View>
                    </View>

                    {/* Timeline */}
                    <View style={s.timeline}>
                      <TimeStep label="Entree"     value={item.entree}     letter="E" color={C.green}  />
                      <View style={[s.timelineLine, { backgroundColor: item.debutPause ? C.warn   : C.border }]} />
                      <TimeStep label="Deb.Pause"  value={item.debutPause} letter="P" color={C.warn}   />
                      <View style={[s.timelineLine, { backgroundColor: item.finPause   ? C.cyan   : C.border }]} />
                      <TimeStep label="Fin Pause"  value={item.finPause}   letter="R" color={C.cyan}   />
                      <View style={[s.timelineLine, { backgroundColor: item.sortie     ? C.red    : C.border }]} />
                      <TimeStep label="Sortie"     value={item.sortie}     letter="S" color={C.red}    />
                    </View>

                    {/* Durees */}
                    {(item.dureeTotal || item.dureePause) && (
                      <View style={s.summaryRow}>
                        {item.dureeTotal && (
                          <View style={[s.summaryBadge, { backgroundColor: `${C.cyan}15`, borderColor: `${C.cyan}44` }]}>
                            <Feather name="clock" size={11} color={C.cyan} />
                            <Text style={[s.summaryText, { color: C.cyan }]}> Travail : {item.dureeTotal}</Text>
                          </View>
                        )}
                        {item.dureePause && (
                          <View style={[s.summaryBadge, { backgroundColor: `${C.warn}15`, borderColor: `${C.warn}44` }]}>
                            <Feather name="coffee" size={11} color={C.warn} />
                            <Text style={[s.summaryText, { color: C.warn }]}> Pause : {item.dureePause}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Statut */}
                    <View style={[s.statusBadge, { backgroundColor: status.bg, borderColor: `${status.color}44` }]}>
                      <View style={[s.statusDot, { backgroundColor: status.color }]} />
                      <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {/* ── TAB EMPLOYES ── */}
      {tab === 'employes' && (
        <>
          <TextInput
            style={[s.search, { marginTop: 12 }]}
            placeholder="Rechercher..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            data={filteredUsers}
            keyExtractor={([id]) => id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={s.center}>
                <Text style={{ color: C.textMuted }}>Aucun employe</Text>
              </View>
            }
            renderItem={({ item: [userId, user] }) => (
              <View style={s.userCard}>
                <View style={[s.userAvatar, { backgroundColor: C.accent }]}>
                  <Text style={s.userAvatarText}>{user.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={s.userInfo}>
                  <Text style={s.userName}>{user.name}</Text>
                  <Text style={s.userSub}>
                    ID: {userId}{user.cardNumber ? `  .  Carte: ${user.cardNumber}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.deleteBtn, { backgroundColor: `${C.red}18`, borderColor: `${C.red}44` }]}
                  onPress={() => handleDelete(userId, user.name)}
                >
                  <Feather name="trash-2" size={18} color={C.red} />
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

    </SafeAreaView>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  header:        { backgroundColor: C.surface, overflow: 'hidden' },
  headerAccentBar:{ height: 3, backgroundColor: C.accentGlow },
  headerInner:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 44, paddingBottom: 14 },
  headerTitleRow:{ flexDirection: 'row', alignItems: 'center' },
  headerTitle:   { color: C.textPrimary, fontSize: 20, fontWeight: '700' },
  headerSub:     { color: C.textMuted, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
  iconBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  liveDot:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  liveText:      { fontSize: 12, fontWeight: '700' },

  tabRow:        { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:        { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:       { fontSize: 13 },

  errorBox:      { margin: 12, padding: 10, borderRadius: 8, borderLeftWidth: 4 },
  errorText:     { fontSize: 13 },

  statsRow:      { flexDirection: 'row', margin: 12, gap: 8 },
  statCard:      { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 2.5, borderWidth: 1, borderColor: C.border },
  statNum:       { fontSize: 26, fontWeight: '800' },
  statLabel:     { color: C.textMuted, fontSize: 10, marginTop: 4, textAlign: 'center' },

  search:        { backgroundColor: C.surfaceAlt, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: C.border, color: C.textPrimary },

  center:        { alignItems: 'center', marginTop: 60 },
  loadingText:   { marginTop: 12, fontSize: 14 },

  card:          { backgroundColor: C.surface, borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  cardAccentBar: { height: 3 },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 12 },
  cardNameRow:   { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  cardName:      { color: C.textPrimary, fontSize: 15, fontWeight: '700', flex: 1 },
  dateBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  dateBadgeText: { fontSize: 11, fontWeight: '600' },

  timeline:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 14 },
  timeItem:      { alignItems: 'center', flex: 1 },
  timeCircle:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  timeCircleText:{ fontSize: 12, fontWeight: '800' },
  timeItemLabel: { color: C.textMuted, fontSize: 9, marginBottom: 4, textAlign: 'center' },
  timeItemValue: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  timelineLine:  { height: 2, flex: 1, marginTop: 16 },

  summaryRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 10 },
  summaryBadge:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  summaryText:   { fontSize: 12, fontWeight: '600' },

  statusBadge:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 14, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start', borderWidth: 1, gap: 6 },
  statusDot:     { width: 7, height: 7, borderRadius: 4 },
  statusText:    { fontSize: 12, fontWeight: '700' },

  userCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  userAvatar:    { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userAvatarText:{ color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo:      { flex: 1 },
  userName:      { color: C.textPrimary, fontSize: 15, fontWeight: '600' },
  userSub:       { color: C.textMuted, fontSize: 12, marginTop: 3 },
  deleteBtn:     { padding: 10, borderRadius: 10, borderWidth: 1 },
});