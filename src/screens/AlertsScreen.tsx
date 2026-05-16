import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AccessDenied from '../components/AccessDenied';
import { useAlerts, AlertType, AlertSeverity } from '../context/AlertsContext';
import { useTheme } from '../context/ThemeContext';



type IconName = React.ComponentProps<typeof Feather>['name'];

const getTypeConfig = (type: AlertType, C: any) => {
  switch (type) {
    case 'motion': return { iconName: 'eye'       as IconName, color: C.red,      label: 'Mouvement' };
    case 'door':   return { iconName: 'unlock'     as IconName, color: C.warn,     label: 'Porte'     };
    case 'alarm':  return { iconName: 'alert-triangle' as IconName, color: C.pink, label: 'Alarme'    };
    case 'button': return { iconName: 'radio'      as IconName, color: C.cyan,     label: 'Bouton'    };
    case 'camera': return { iconName: 'video'      as IconName, color: C.accentGlow, label: 'Caméra'  };
  }
};

const getSeverityConfig = (severity: AlertSeverity, C: any) => {
  switch (severity) {
    case 'high':   return { label: 'CRITIQUE', color: C.red,  bg: `${C.red}22`  };
    case 'medium': return { label: 'MOYEN',    color: C.warn, bg: `${C.warn}22` };
    case 'low':    return { label: 'FAIBLE',   color: C.cyan, bg: `${C.cyan}22` };
  }
};

type FilterType = 'all' | AlertType | 'active' | 'resolved';

type FilterItem = {
  key: FilterType;
  label: string;
  iconName: IconName;
  color: string;
};

const AlertsScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);
  const router = useRouter();
  const { hasPermission } = useAuth();
  if (!hasPermission('alerts')) return <AccessDenied feature="Alertes" />;

  const { alerts, resolveAlert, deleteAlert, resolveAll, connected, fbConnected } = useAlerts();
  const [filter, setFilter] = useState<FilterType>('all');

  const activeAlerts   = alerts.filter(a => !a.resolved);
  const filteredAlerts = alerts.filter(a => {
    if (filter === 'all')      return true;
    if (filter === 'active')   return !a.resolved;
    if (filter === 'resolved') return a.resolved;
    return a.type === filter;
  });

  const confirmDelete = (id: string) => {
    Alert.alert('Supprimer', 'Supprimer cette alerte ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteAlert(id) },
    ]);
  };

  const confirmResolveAll = () => {
    Alert.alert('Tout résoudre', 'Marquer toutes les alertes comme résolues ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: resolveAll },
    ]);
  };

  const filters: FilterItem[] = [
    { key: 'all',      label: 'Tout',    iconName: 'list',            color: C.accentGlow },
    { key: 'active',   label: 'Actives', iconName: 'alert-circle',    color: C.red        },
    { key: 'resolved', label: 'Résolues',iconName: 'check-circle',    color: C.online     },
    { key: 'motion',   label: 'PIR',     iconName: 'eye',             color: C.red        },
    { key: 'door',     label: 'Porte',   iconName: 'unlock',          color: C.warn       },
    { key: 'alarm',    label: 'Alarme',  iconName: 'alert-triangle',  color: C.pink       },
    { key: 'camera',   label: 'Caméra',  iconName: 'video',           color: C.accentGlow },
  ];

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
              <Feather name="bell" size={18} color={C.accentGlow} />
              <Text style={s.headerTitle}> Alertes</Text>
              {activeAlerts.length > 0 && (
                <View style={s.headerBadge}>
                  <Text style={s.headerBadgeText}>{activeAlerts.length}</Text>
                </View>
              )}
            </View>
            <Text style={s.headerSub}>Surveillance · Sécurité</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { val: activeAlerts.length,                  label: 'Actives',  color: C.red,       icon: 'alert-circle' as IconName  },
          { val: alerts.filter(a => a.resolved).length,label: 'Résolues', color: C.online,    icon: 'check-circle' as IconName  },
          { val: alerts.length,                        label: 'Total',    color: C.accentGlow,icon: 'bell'         as IconName  },
        ].map((item, i) => (
          <View key={i} style={[s.statCard, { borderTopColor: item.color }]}>
            <Feather name={item.icon} size={16} color={item.color} style={{ marginBottom: 6 }} />
            <Text style={[s.statNum, { color: item.color }]}>{item.val}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersContent}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterBtn, filter === f.key && { backgroundColor: `${f.color}22`, borderColor: `${f.color}66` }]}
            onPress={() => setFilter(f.key)}
          >
            <Feather name={f.iconName} size={12} color={filter === f.key ? f.color : C.textMuted} />
            <Text style={[s.filterBtnText, { color: filter === f.key ? f.color : C.textMuted }]}>
              {' '}{f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Resolve all */}
      {activeAlerts.length > 0 && (
        <TouchableOpacity style={s.resolveAllBtn} onPress={confirmResolveAll}>
          <Feather name="check-circle" size={14} color={C.online} />
          <Text style={s.resolveAllText}> Tout marquer comme résolu ({activeAlerts.length})</Text>
        </TouchableOpacity>
      )}

      {/* List */}
      <View style={s.alertsList}>
        {filteredAlerts.length === 0 ? (
          <View style={s.emptyBox}>
            <Feather name="bell-off" size={42} color={C.textMuted} style={{ marginBottom: 12 }} />
            <Text style={s.emptyText}>
              {alerts.length === 0 ? "En attente d'alertes...\nLes alertes apparaîtront ici en temps réel" : 'Aucune alerte dans cette catégorie'}
            </Text>
          </View>
        ) : filteredAlerts.map(alert => {
          const typeConf = getTypeConfig(alert.type, C);
          const sevConf  = getSeverityConfig(alert.severity, C);
          return (
            <View key={alert.id} style={[s.alertCard, { borderLeftColor: alert.resolved ? C.border : typeConf.color }, alert.resolved && { opacity: 0.55 }]}>
              {/* Top */}
              <View style={s.alertTop}>
                <View style={s.alertTopLeft}>
                  <View style={[s.alertIconBox, { backgroundColor: alert.resolved ? C.surfaceAlt : `${typeConf.color}20`, borderColor: `${typeConf.color}44` }]}>
                    <Feather name={typeConf.iconName} size={18} color={alert.resolved ? C.textMuted : typeConf.color} />
                  </View>
                  <View>
                    <Text style={[s.alertTitle, { color: alert.resolved ? C.textMuted : C.textPrimary }]}>{alert.title}</Text>
                    <View style={s.alertLocRow}>
                      <Feather name="map-pin" size={10} color={C.textMuted} />
                      <Text style={s.alertLocation}> {alert.location}</Text>
                    </View>
                  </View>
                </View>
                <View style={[s.severityBadge, { backgroundColor: sevConf.bg, borderColor: `${sevConf.color}44` }]}>
                  <Text style={[s.severityText, { color: sevConf.color }]}>{sevConf.label}</Text>
                </View>
              </View>

              <Text style={[s.alertMessage, { color: alert.resolved ? C.textMuted : C.textSecond }]}>{alert.message}</Text>

              {/* Bottom */}
              <View style={s.alertBottom}>
                <View style={s.alertTimeRow}>
                  <Feather name="clock" size={11} color={C.textMuted} />
                  <Text style={s.alertTime}> {alert.time}</Text>
                </View>
                <View style={s.alertActions}>
                  {!alert.resolved ? (
                    <TouchableOpacity style={s.resolveBtn} onPress={() => resolveAlert(alert.id)}>
                      <Feather name="check" size={12} color={C.online} />
                      <Text style={s.resolveBtnText}> Résoudre</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.resolvedTag}>
                      <Feather name="check-circle" size={12} color={C.online} />
                      <Text style={s.resolvedTagText}> Résolu</Text>
                    </View>
                  )}
                  <TouchableOpacity style={s.deleteBtn} onPress={() => confirmDelete(alert.id)}>
                    <Feather name="trash-2" size={14} color={C.offline} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
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
  headerBadge: { backgroundColor: C.red, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  headerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  headerSub: { color: C.textMuted, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 2.5, borderWidth: 1, borderColor: C.border },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  filtersContent: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterBtnText: { fontSize: 12, fontWeight: '600' },
  resolveAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: `${C.online}12`, borderWidth: 1, borderColor: `${C.online}44`, borderRadius: 10, padding: 12, margin: 12, marginTop: 4 },
  resolveAllText: { color: C.online, fontSize: 13, fontWeight: '700' },
  alertsList: { padding: 12 },
  emptyBox: { alignItems: 'center', padding: 40 },
  emptyText: { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  alertCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border },
  alertTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  alertTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertIconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700' },
  alertLocRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  alertLocation: { color: C.textMuted, fontSize: 11 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  severityText: { fontSize: 10, fontWeight: '700' },
  alertMessage: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  alertBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertTimeRow: { flexDirection: 'row', alignItems: 'center' },
  alertTime: { color: C.textMuted, fontSize: 11 },
  alertActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.online}18`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: `${C.online}44` },
  resolveBtnText: { color: C.online, fontSize: 11, fontWeight: '700' },
  resolvedTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.online}12`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  resolvedTagText: { color: C.online, fontSize: 11 },
  deleteBtn: { backgroundColor: `${C.offline}18`, padding: 7, borderRadius: 8, borderWidth: 1, borderColor: `${C.offline}33` },
});

export default AlertsScreen;