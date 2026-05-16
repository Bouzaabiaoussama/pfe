import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useCameras } from '../context/CameraContext';
import { useTheme } from '../context/ThemeContext';



type CamType = 'ip' | 'dvr';

interface EditState {
  id: string; name: string; ip: string; user: string;
  pass: string; port: string; path: string; channel: string; type: CamType;
}

const RASPBERRY_IP = '100.103.171.77';

const toStreamName = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');

const parseUri = (uri: string): Partial<EditState> => {
  try {
    const m = uri.match(/rtsp:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.*)/);
    if (!m) return {};
    const [, u, p, ip, port, rest] = m;
    const chMatch = rest.match(/Streaming\/Channels\/(\d+)/);
    if (chMatch) {
      return { user: u, pass: p, ip, port, channel: String(Math.floor(parseInt(chMatch[1]) / 100)), type: 'dvr' };
    }
    return { user: u, pass: p, ip, port, path: rest, type: 'ip' };
  } catch { return {}; }
};

const buildUri = (s: EditState) => {
  if (s.type === 'dvr')
    return `rtsp://${s.user}:${s.pass}@${s.ip}:${s.port}/Streaming/Channels/${String(parseInt(s.channel) * 100 + 1)}`;
  return `rtsp://${s.user}:${s.pass}@${s.ip}:${s.port}/${s.path}`;
};

// ─── FormField ───────────────────────────────────────────────────────────────
// FormField defined locally — uses s and C from closure


// ─── Main screen ─────────────────────────────────────────────────────────────
const CameraManagementScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);

  const FormField = ({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize }: {
    label: string; value: string; onChangeText: any;
    placeholder?: string; secureTextEntry?: boolean;
    keyboardType?: any; autoCapitalize?: any;
  }) => (
    <>
      <Text style={s.formLabel}>{label}</Text>
      <TextInput
        style={s.formInput}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={C.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'none'}
      />
    </>
  );

  const router = useRouter();
  const { cameras, addCamera, deleteCamera, networkMode, switchNetwork } = useCameras();

  const [addModal,  setAddModal]  = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newIp,      setNewIp]      = useState('');
  const [newUser,    setNewUser]    = useState('admin');
  const [newPass,    setNewPass]    = useState('');
  const [newPort,    setNewPort]    = useState('554');
  const [newPath,    setNewPath]    = useState('');
  const [newChannel, setNewChannel] = useState('1');
  const [newType,    setNewType]    = useState<CamType>('ip');
  const [adding,     setAdding]     = useState(false);
  const [editState,  setEditState]  = useState<EditState | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetAdd = () => {
    setNewName(''); setNewIp(''); setNewUser('admin');
    setNewPass(''); setNewPort('554'); setNewPath('');
    setNewChannel('1'); setNewType('ip');
  };

  const openEdit = (cam: any) => {
    const parsed = parseUri(cam.uriLocal || cam.uri);
    setEditState({
      id: cam.id, name: cam.name,
      ip: parsed.ip || cam.ip || '', user: parsed.user || 'admin',
      pass: parsed.pass || '', port: parsed.port || '554',
      path: parsed.path || '', channel: parsed.channel || '1',
      type: parsed.type || 'ip',
    });
    setEditModal(true);
  };

  const handleAdd = async () => {
    if (!newName || !newIp || !newPass) { Alert.alert('Champs requis', 'Remplis : Nom, IP et Mot de passe'); return; }
    setAdding(true);
    const draft: EditState = { id: '', name: newName, ip: newIp, user: newUser, pass: newPass, port: newPort, path: newPath, channel: newChannel, type: newType };
    const uri = buildUri(draft);
    const streamName = toStreamName(newName);
    const cam = { id: `c${Date.now()}`, name: newName, ip: newIp, uri, uriLocal: uri, uriTailscale: `rtsp://${RASPBERRY_IP}:8554/${streamName}`, location: newType === 'dvr' ? 'DVR' : 'Maison' };
    const result = await addCamera(cam);
    setAdding(false);
    Alert.alert(result.success ? 'Ajoutée' : 'Partiellement ajoutée', result.success ? `"${newName}" configurée !` : 'Sauvegardée dans Firebase.\nRaspberry Pi non joignable.');
    setAddModal(false); resetAdd();
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    if (!editState.name || !editState.ip || !editState.pass) { Alert.alert('Champs requis', 'Remplis : Nom, IP et Mot de passe'); return; }
    setSaving(true);
    const uri = buildUri(editState);
    const streamName = toStreamName(editState.name);
    const cam = { id: editState.id, name: editState.name, ip: editState.ip, uri, uriLocal: uri, uriTailscale: `rtsp://${RASPBERRY_IP}:8554/${streamName}`, location: editState.type === 'dvr' ? 'DVR' : 'Maison' };
    await deleteCamera(editState.id);
    const result = await addCamera({ ...cam, id: editState.id });
    setSaving(false);
    Alert.alert(result.success ? 'Modifiée' : 'Mise à jour partielle', result.success ? `"${editState.name}" mise à jour !` : 'Firebase OK, Raspberry non joignable.');
    setEditModal(false);
  };

  const handleDelete = (id: string) => {
    const cam = cameras.find(c => c.id === id);
    Alert.alert('Supprimer', `Supprimer "${cam?.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { setDeletingId(id); await deleteCamera(id); setDeletingId(null); } },
    ]);
  };

  const getCamIcon = (cam: any): React.ComponentProps<typeof Feather>['name'] => {
    if (cam.name?.toLowerCase().includes('dvr')) return 'server';
    if (cam.name?.toLowerCase().includes('ezviz')) return 'radio';
    return 'video';
  };

  const TypeSelector = ({ value, onChange }: { value: CamType; onChange: (t: CamType) => void }) => (
    <View style={s.typeRow}>
      {([['ip', 'video', 'Caméra IP'], ['dvr', 'server', 'DVR / NVR']] as const).map(([t, icon, lb]) => (
        <TouchableOpacity key={t} style={[s.typeBtn, value === t && s.typeBtnActive]} onPress={() => onChange(t)}>
          <Feather name={icon} size={20} color={value === t ? '#fff' : C.textMuted} />
          <Text style={[s.typeBtnText, value === t && s.typeBtnTextActive]}>{lb}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={s.root}>

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerAccentBar} />
        <View style={s.headerInner}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={C.accentGlow} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <View style={s.headerTitleRow}>
              <Feather name="video" size={17} color={C.accentGlow} />
              <Text style={s.headerTitle}> Gestion des Caméras</Text>
            </View>
            <Text style={s.headerSub}>{cameras.length} caméra(s) · mode {networkMode}</Text>
          </View>
          <TouchableOpacity style={s.addHeaderBtn} onPress={() => setAddModal(true)}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera list */}
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {cameras.length === 0 ? (
          <View style={s.emptyState}>
            <Feather name="video-off" size={48} color={C.textMuted} style={{ marginBottom: 12 }} />
            <Text style={s.emptyText}>Aucune caméra</Text>
            <TouchableOpacity style={s.emptyAddBtn} onPress={() => setAddModal(true)}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={s.emptyAddBtnText}> Ajouter une caméra</Text>
            </TouchableOpacity>
          </View>
        ) : cameras.map(cam => (
          <View key={cam.id} style={s.camCard}>
            {/* Top */}
            <View style={s.camCardTop}>
              <View style={s.camIconBox}>
                <Feather name={getCamIcon(cam)} size={22} color={C.accentGlow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.camName}>{cam.name}</Text>
                <View style={s.camSubRow}>
                  <Feather name="map-pin" size={11} color={C.textMuted} />
                  <Text style={s.camSub}> {cam.location}</Text>
                </View>
              </View>
            </View>

            {/* Info box */}
            <View style={s.camInfoBox}>
              <View style={s.camInfoRow}>
                <View style={s.camInfoLabelRow}>
                  <Feather name="globe" size={11} color={C.textMuted} />
                  <Text style={s.camInfoLabel}> IP</Text>
                </View>
                <Text style={[s.camInfoVal, { color: C.cyan }]}>{cam.ip}</Text>
              </View>
              <View style={s.camInfoDivider} />
              <View style={s.camInfoRow}>
                <View style={s.camInfoLabelRow}>
                  <Feather name="link" size={11} color={C.textMuted} />
                  <Text style={s.camInfoLabel}> URI active</Text>
                </View>
                <Text style={[s.camInfoVal, { color: C.online, flex: 1, textAlign: 'right' }]} numberOfLines={1}>{cam.uri}</Text>
              </View>
              {cam.uriLocal && cam.uriLocal !== cam.uri && (
                <>
                  <View style={s.camInfoDivider} />
                  <View style={s.camInfoRow}>
                    <View style={s.camInfoLabelRow}>
                      <Feather name="home" size={11} color={C.textMuted} />
                      <Text style={s.camInfoLabel}> Local</Text>
                    </View>
                    <Text style={[s.camInfoVal, { color: C.textMuted, flex: 1, textAlign: 'right' }]} numberOfLines={1}>{cam.uriLocal}</Text>
                  </View>
                </>
              )}
              {cam.uriTailscale && cam.uriTailscale !== cam.uri && (
                <>
                  <View style={s.camInfoDivider} />
                  <View style={s.camInfoRow}>
                    <View style={s.camInfoLabelRow}>
                      <Feather name="globe" size={11} color={C.textMuted} />
                      <Text style={s.camInfoLabel}> Tailscale</Text>
                    </View>
                    <Text style={[s.camInfoVal, { color: C.textMuted, flex: 1, textAlign: 'right' }]} numberOfLines={1}>{cam.uriTailscale}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Actions */}
            <View style={s.camActions}>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${C.cyan}15`, borderColor: `${C.cyan}33` }]} onPress={() => openEdit(cam)}>
                <Feather name="edit-2" size={14} color={C.cyan} />
                <Text style={[s.actionBtnText, { color: C.cyan }]}>Modifier</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: `${C.offline}12`, borderColor: `${C.offline}33` }, deletingId === cam.id && { opacity: 0.5 }]}
                onPress={() => handleDelete(cam.id)} disabled={deletingId === cam.id}
              >
                {deletingId === cam.id
                  ? <ActivityIndicator size="small" color={C.offline} />
                  : <><Feather name="trash-2" size={14} color={C.offline} /><Text style={[s.actionBtnText, { color: C.offline }]}>Supprimer</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── MODAL ADD ── */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => { setAddModal(false); resetAdd(); }}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="plus-circle" size={18} color={C.accentGlow} />
                  <Text style={s.modalTitle}> Ajouter une caméra</Text>
                </View>
                <TouchableOpacity onPress={() => { setAddModal(false); resetAdd(); }}>
                  <Feather name="x" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={s.infoBanner}>
                <Feather name="server" size={12} color={C.online} />
                <Text style={s.infoBannerText}> Firebase + MediaMTX via Raspberry ({RASPBERRY_IP})</Text>
              </View>

              <Text style={s.formLabel}>Type</Text>
              <TypeSelector value={newType} onChange={setNewType} />

              <FormField label="Nom *" value={newName} onChangeText={setNewName} placeholder="Ex: Entrée principale" />
              {newName.length > 0 && (
                <Text style={s.streamPreview}>Stream : <Text style={{ color: C.online }}>{toStreamName(newName)}</Text></Text>
              )}
              <FormField label="Adresse IP *" value={newIp} onChangeText={setNewIp} placeholder="192.168.10.x" keyboardType="numeric" />

              <View style={s.formRow}>
                <View style={{ flex: 1 }}><FormField label="Utilisateur" value={newUser} onChangeText={setNewUser} placeholder="admin" autoCapitalize="none" /></View>
                <View style={{ flex: 1 }}><FormField label="Mot de passe *" value={newPass} onChangeText={setNewPass} placeholder="••••••" secureTextEntry /></View>
              </View>
              <View style={s.formRow}>
                <View style={{ flex: 1 }}><FormField label="Port" value={newPort} onChangeText={setNewPort} placeholder="554" keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label={newType === 'dvr' ? 'Canal' : 'Chemin'}
                    value={newType === 'dvr' ? newChannel : newPath}
                    onChangeText={newType === 'dvr' ? setNewChannel : setNewPath}
                    placeholder={newType === 'dvr' ? '1' : 'h264_stream'}
                    keyboardType={newType === 'dvr' ? 'numeric' : 'default'}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {newIp ? (
                <View style={s.uriPreview}>
                  <Text style={s.uriPreviewLabel}>URI RTSP générée :</Text>
                  <Text style={s.uriPreviewText} numberOfLines={2}>
                    {buildUri({ id: '', name: newName, ip: newIp, user: newUser, pass: newPass, port: newPort, path: newPath, channel: newChannel, type: newType })}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity style={[s.confirmBtn, adding && { opacity: 0.6 }]} onPress={handleAdd} disabled={adding}>
                {adding ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={16} color="#fff" /><Text style={s.confirmBtnText}> Ajouter la caméra</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setAddModal(false); resetAdd(); }}>
                <Text style={s.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL EDIT ── */}
      <Modal visible={editModal} animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHandle} />
            {editState && (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="edit-2" size={18} color={C.cyan} />
                    <Text style={s.modalTitle}> Modifier la caméra</Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditModal(false)}>
                    <Feather name="x" size={20} color={C.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={[s.infoBanner, { backgroundColor: `${C.cyan}10`, borderColor: `${C.cyan}33` }]}>
                  <Feather name="edit" size={12} color={C.cyan} />
                  <Text style={[s.infoBannerText, { color: C.cyan }]}> Modifie l'IP, les identifiants ou le type</Text>
                </View>

                <Text style={s.formLabel}>Type</Text>
                <TypeSelector value={editState.type} onChange={t => setEditState({ ...editState, type: t })} />

                <FormField label="Nom *" value={editState.name} onChangeText={(v: string) => setEditState({ ...editState, name: v })} placeholder="Ex: Entrée principale" />
                <FormField label="Adresse IP *" value={editState.ip} onChangeText={(v: string) => setEditState({ ...editState, ip: v })} placeholder="192.168.10.x" keyboardType="numeric" />
                <View style={s.formRow}>
                  <View style={{ flex: 1 }}><FormField label="Utilisateur" value={editState.user} onChangeText={(v: string) => setEditState({ ...editState, user: v })} placeholder="admin" autoCapitalize="none" /></View>
                  <View style={{ flex: 1 }}><FormField label="Mot de passe *" value={editState.pass} onChangeText={(v: string) => setEditState({ ...editState, pass: v })} placeholder="••••••" secureTextEntry /></View>
                </View>
                <View style={s.formRow}>
                  <View style={{ flex: 1 }}><FormField label="Port" value={editState.port} onChangeText={(v: string) => setEditState({ ...editState, port: v })} placeholder="554" keyboardType="numeric" /></View>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label={editState.type === 'dvr' ? 'Canal' : 'Chemin'}
                      value={editState.type === 'dvr' ? editState.channel : editState.path}
                      onChangeText={(v: string) => setEditState(editState.type === 'dvr' ? { ...editState, channel: v } : { ...editState, path: v })}
                      placeholder={editState.type === 'dvr' ? '1' : 'h264_stream'}
                      keyboardType={editState.type === 'dvr' ? 'numeric' : 'default'}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {editState.ip ? (
                  <View style={s.uriPreview}>
                    <Text style={s.uriPreviewLabel}>Nouvelle URI locale :</Text>
                    <Text style={s.uriPreviewText} numberOfLines={2}>{buildUri(editState)}</Text>
                  </View>
                ) : null}

                <TouchableOpacity style={[s.confirmBtn, { backgroundColor: C.cyan }, saving && { opacity: 0.6 }]} onPress={handleSaveEdit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <><Feather name="save" size={16} color="#fff" /><Text style={s.confirmBtnText}> Sauvegarder</Text></>}
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setEditModal(false)}>
                  <Text style={s.cancelBtnText}>Annuler</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (C: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header:          { backgroundColor: C.surface, overflow: 'hidden' },
  headerAccentBar: { height: 3, backgroundColor: C.accentGlow },
  headerInner:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 44, paddingBottom: 14, gap: 10 },
  headerCenter:    { flex: 1 },
  headerTitleRow:  { flexDirection: 'row', alignItems: 'center' },
  headerTitle:     { color: C.textPrimary, fontSize: 18, fontWeight: '700' },
  headerSub:       { color: C.textMuted, fontSize: 11, marginTop: 2 },
  iconBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  addHeaderBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyState:    { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyText:     { color: C.textMuted, fontSize: 16, marginBottom: 20 },
  emptyAddBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyAddBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  // Camera card
  camCard:      { marginHorizontal: 12, marginTop: 10, backgroundColor: C.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  camCardTop:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  camIconBox:   { width: 44, height: 44, borderRadius: 11, backgroundColor: `${C.accentGlow}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  camName:      { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  camSubRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  camSub:       { color: C.textMuted, fontSize: 11 },
  camInfoBox:   { backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  camInfoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  camInfoLabelRow: { flexDirection: 'row', alignItems: 'center' },
  camInfoLabel: { color: C.textMuted, fontSize: 11, fontWeight: '600' },
  camInfoVal:   { color: C.textSecond, fontSize: 11, fontWeight: '500' },
  camInfoDivider:{ height: 1, backgroundColor: C.border, marginVertical: 2 },
  camActions:   { flexDirection: 'row', gap: 8 },
  actionBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 10, borderWidth: 1, gap: 6 },
  actionBtnText:{ fontSize: 13, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '94%', borderTopWidth: 2, borderTopColor: C.accentGlow },
  modalHandle:  { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle:   { color: C.textPrimary, fontSize: 18, fontWeight: '700' },
  infoBanner:   { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.online}10`, borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: `${C.online}33` },
  infoBannerText: { color: C.online, fontSize: 11, lineHeight: 16 },
  typeRow:      { flexDirection: 'row', gap: 10, marginBottom: 6 },
  typeBtn:      { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, gap: 6 },
  typeBtnActive:{ borderColor: C.accentGlow, backgroundColor: `${C.accent}33` },
  typeBtnText:  { color: C.textMuted, fontSize: 12 },
  typeBtnTextActive: { color: '#fff', fontWeight: '700' },
  formLabel:    { color: C.accentGlow, fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  formInput:    { backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, fontSize: 14, marginBottom: 4, color: C.textPrimary },
  formRow:      { flexDirection: 'row', gap: 10 },
  streamPreview:{ color: C.textMuted, fontSize: 11, marginBottom: 6 },
  uriPreview:   { backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border },
  uriPreviewLabel: { color: C.textMuted, fontSize: 11, marginBottom: 4 },
  uriPreviewText:  { color: C.online, fontSize: 11 },
  confirmBtn:   { backgroundColor: C.accent, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn:    { padding: 14, alignItems: 'center', marginTop: 4 },
  cancelBtnText:{ color: C.textMuted, fontSize: 14 },
});

export default CameraManagementScreen;