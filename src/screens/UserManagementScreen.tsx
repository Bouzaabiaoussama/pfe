import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { get, ref, remove, set, update } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert, Modal, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { auth, database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// ─── Types locaux indépendants de AuthContext ─────────────────────────────────
type UserRole = 'admin' | 'security' | 'user';

// Permissions comme objet boolean — indépendant du type Permission de AuthContext
type PermMap = {
  cameras:    boolean;
  alerts:     boolean;
  access:     boolean;
  lights:     boolean;
  iot:        boolean;
  pointeuses: boolean;
};

const DEFAULT_PERM_MAP: PermMap = {
  cameras:    false,
  alerts:     false,
  access:     false,
  lights:     false,
  iot:        false,
  pointeuses: false,
};

const ADMIN_PERM_MAP: PermMap = {
  cameras:    true,
  alerts:     true,
  access:     true,
  lights:     true,
  iot:        true,
  pointeuses: true,
};

type AppUser = {
  uid:        string;
  username:   string;
  email:      string;
  role:       UserRole;
  phone?:     string;
  createdAt?: string;
  permissions: PermMap;
};

const PERMISSION_LIST: { key: keyof PermMap; label: string; icon: string; desc: string }[] = [
  { key: 'cameras',    label: 'Caméras',      icon: '📹', desc: 'Voir les caméras en direct' },
  { key: 'alerts',     label: 'Alertes',      icon: '🔔', desc: 'Voir les alertes et notifications' },
  { key: 'access',     label: 'Accès/Portes', icon: '🚪', desc: 'Contrôler les portes et accès' },
  { key: 'lights',     label: 'Lumières',     icon: '💡', desc: 'Contrôler les lumières' },
  { key: 'iot',        label: 'IoT',          icon: '🌡️', desc: 'Voir les capteurs IoT' },
  { key: 'pointeuses', label: 'Pointeuses',   icon: '🖥️', desc: 'Voir les pointeuses ZKTeco' },
];

// ─── Utilitaire : convertir tableau Permission[] → PermMap ────────────────────
const permArrayToMap = (perms: any): PermMap => {
  if (!perms) return { ...DEFAULT_PERM_MAP };
  // Si c'est déjà un objet boolean
  if (typeof perms === 'object' && !Array.isArray(perms)) {
    return {
      cameras:    !!perms.cameras,
      alerts:     !!perms.alerts,
      access:     !!perms.access,
      lights:     !!perms.lights,
      iot:        !!perms.iot,
      pointeuses: !!perms.pointeuses,
    };
  }
  // Si c'est un tableau de strings
  if (Array.isArray(perms)) {
    const map = { ...DEFAULT_PERM_MAP };
    (perms as string[]).forEach(p => {
      if (p in map) (map as any)[p] = true;
    });
    return map;
  }
  return { ...DEFAULT_PERM_MAP };
};

const UserManagementScreen = () => {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const theme = useTheme();

  const [users, setUsers]             = useState<AppUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [createModal, setCreateModal]   = useState(false);
  const [permModal, setPermModal]       = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [tempPerms, setTempPerms]       = useState<PermMap>({ ...DEFAULT_PERM_MAP });
  const [savingPerms, setSavingPerms]   = useState(false);

  const [form, setForm] = useState({
    username: '', email: '', password: '', phone: '', role: 'user' as UserRole,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]     = useState('');

  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      Alert.alert('Accès refusé', 'Seul un administrateur peut accéder à cette page.');
      router.back();
    }
  }, [currentUser]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(database, 'users'));
      if (snap.exists()) {
        const data = snap.val();
        const list: AppUser[] = Object.values(data).map((u: any) => ({
          uid:         u.uid,
          username:    u.username,
          email:       u.email,
          role:        (u.role as UserRole) || 'user',
          phone:       u.phone || '',
          createdAt:   u.createdAt || '',
          permissions: permArrayToMap(u.permissions),
        }));
        list.sort((a, b) => {
          if (a.role === 'admin' && b.role !== 'admin') return -1;
          if (a.role !== 'admin' && b.role === 'admin') return 1;
          return a.username.localeCompare(b.username);
        });
        setUsers(list);
      } else {
        setUsers([]);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les utilisateurs.');
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    setFormError('');
    const { username, email, password, phone, role } = form;
    if (!username.trim() || !email.trim() || !password.trim())
      return setFormError('Username, email et mot de passe sont obligatoires.');
    if (password.length < 6)
      return setFormError('Le mot de passe doit contenir au moins 6 caractères.');

    setFormLoading(true);
    try {
      const usernameSnap = await get(ref(database, `usernames/${username.trim()}`));
      if (usernameSnap.exists()) { setFormLoading(false); return setFormError("Nom d'utilisateur déjà utilisé."); }
      if (phone.trim()) {
        const phoneSnap = await get(ref(database, `phones/${phone.trim()}`));
        if (phoneSnap.exists()) { setFormLoading(false); return setFormError('Numéro de téléphone déjà utilisé.'); }
      }
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;
      const initPerms = role === 'admin' ? ADMIN_PERM_MAP : { ...DEFAULT_PERM_MAP };
      await set(ref(database, `users/${uid}`), {
        uid, username: username.trim(), email: email.trim(),
        role, phone: phone.trim(),
        createdAt: new Date().toISOString(),
        permissions: initPerms,
      });
      await set(ref(database, `usernames/${username.trim()}`), email.trim());
      if (phone.trim()) await set(ref(database, `phones/${phone.trim()}`), uid);

      setCreateModal(false);
      setForm({ username: '', email: '', password: '', phone: '', role: 'user' });
      Alert.alert('✅ Créé', `"${username}" créé avec le rôle "${role}".`);
      fetchUsers();
    } catch (error: any) {
      let msg = 'Erreur lors de la création.';
      if (error.code === 'auth/email-already-in-use') msg = 'Email déjà utilisé.';
      if (error.code === 'auth/invalid-email') msg = 'Email invalide.';
      setFormError(msg);
    }
    setFormLoading(false);
  };

  const openPermModal = (u: AppUser) => {
    setSelectedUser(u);
    setTempPerms({ ...u.permissions });
    setPermModal(true);
  };

  const handleSavePerms = async () => {
    if (!selectedUser) return;
    setSavingPerms(true);
    try {
      await update(ref(database, `users/${selectedUser.uid}`), { permissions: tempPerms });
      setUsers((prev: AppUser[]) =>
        prev.map((u: AppUser) => u.uid === selectedUser.uid ? { ...u, permissions: tempPerms } : u)
      );
      setPermModal(false);
      Alert.alert('✅ Permissions mises à jour', `Les accès de "${selectedUser.username}" ont été modifiés.`);
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder les permissions.');
    }
    setSavingPerms(false);
  };

  const handleDelete = (u: AppUser) => {
    if (u.uid === currentUser?.uid)
      return Alert.alert('❌ Interdit', 'Vous ne pouvez pas supprimer votre propre compte.');
    Alert.alert('⚠️ Confirmer', `Supprimer "${u.username}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await remove(ref(database, `users/${u.uid}`));
          await remove(ref(database, `usernames/${u.username}`));
          if (u.phone) await remove(ref(database, `phones/${u.phone}`));
          fetchUsers();
        } catch { Alert.alert('Erreur', 'Impossible de supprimer.'); }
      }},
    ]);
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    user:  users.filter(u => u.role !== 'admin').length,
  };

  const { bg, cardBg, textPrimary, textSecondary, border, headerBg, inputBg } = theme;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 24 }}>⬅️</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>👥 Gestion des utilisateurs</Text>
          <Text style={styles.headerSub}>Comptes · Rôles · Permissions</Text>
        </View>
        <TouchableOpacity onPress={() => setCreateModal(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      <ScrollView>
        {/* Stats */}
        <View style={styles.statsRow}>
          {([
            { label: 'Total',     value: stats.total, color: '#7b2ff7' },
            { label: '👑 Admins', value: stats.admin, color: '#ff6b6b' },
            { label: '👤 Users',  value: stats.user,  color: '#00d4ff' },
          ] as { label: string; value: number; color: string }[]).map((st, i) => (
            <View key={String(i)} style={[styles.statCard, { backgroundColor: cardBg, borderTopColor: st.color }]}>
              <Text style={[styles.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={[styles.statLabel, { color: textSecondary }]}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <TextInput
            placeholder="Rechercher..."
            placeholderTextColor={textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: textPrimary }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={{ color: textSecondary, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator size="large" color="#7b2ff7" />
          </View>
        ) : filtered.map((u: AppUser) => {
          const isAdmin = u.role === 'admin';
          const isMe    = u.uid === currentUser?.uid;
          const activeCount = Object.values(u.permissions).filter(Boolean).length;

          return (
            <View key={String(u.uid)} style={[
              styles.userCard,
              { backgroundColor: cardBg, borderLeftColor: isAdmin ? '#ff6b6b' : '#00d4ff' },
            ]}>
              <View style={styles.userTop}>
                <View style={[styles.avatar, { backgroundColor: isAdmin ? 'rgba(255,107,107,0.15)' : 'rgba(0,212,255,0.15)' }]}>
                  <Text style={{ fontSize: 22 }}>{isAdmin ? '👑' : '👤'}</Text>
                </View>
                <View style={styles.userInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.userName, { color: textPrimary }]}>{u.username}</Text>
                    {isMe && <Text style={styles.meBadge}>MOI</Text>}
                  </View>
                  <Text style={{ fontSize: 12, color: textSecondary }}>📧 {u.email}</Text>
                  {u.phone ? <Text style={{ fontSize: 12, color: textSecondary }}>📞 {u.phone}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.roleBadge, { backgroundColor: isAdmin ? 'rgba(255,107,107,0.15)' : 'rgba(0,212,255,0.15)' }]}>
                    <Text style={[styles.roleBadgeText, { color: isAdmin ? '#ff6b6b' : '#00d4ff' }]}>
                      {isAdmin ? 'Admin' : 'Utilisateur'}
                    </Text>
                  </View>
                  {!isAdmin && (
                    <Text style={{ fontSize: 10, color: textSecondary }}>{activeCount}/6 accès</Text>
                  )}
                </View>
              </View>

              {/* Permissions preview */}
              {!isAdmin && (
                <View style={[styles.permsPreview, { backgroundColor: inputBg }]}>
                  {PERMISSION_LIST.map(p => (
                    <View key={String(p.key)} style={styles.permChip}>
                      <Text style={{ fontSize: 14 }}>{p.icon}</Text>
                      <Text style={[styles.permChipText, { color: u.permissions[p.key] ? '#00ff88' : '#555' }]}>
                        {u.permissions[p.key] ? '✓' : '✗'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {isAdmin && (
                <View style={[styles.permsPreview, { backgroundColor: 'rgba(255,107,107,0.08)' }]}>
                  <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 'bold' }}>
                    👑 Accès complet à toutes les fonctionnalités
                  </Text>
                </View>
              )}

              {!isMe && !isAdmin && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: 'rgba(123,47,247,0.12)', borderColor: '#7b2ff7' }]}
                    onPress={() => openPermModal(u)}>
                    <Text style={[styles.actionBtnText, { color: '#7b2ff7' }]}>🔐 Gérer les accès</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: 'rgba(255,68,68,0.1)', borderColor: '#ff4444' }]}
                    onPress={() => handleDelete(u)}>
                    <Text style={[styles.actionBtnText, { color: '#ff4444' }]}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!isMe && isAdmin && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, backgroundColor: 'rgba(255,68,68,0.1)', borderColor: '#ff4444' }]}
                    onPress={() => handleDelete(u)}>
                    <Text style={[styles.actionBtnText, { color: '#ff4444' }]}>🗑️ Supprimer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal : Créer utilisateur ── */}
      <Modal visible={createModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>➕ Nouvel utilisateur</Text>
              <TouchableOpacity onPress={() => { setCreateModal(false); setFormError(''); }}>
                <Text style={{ color: '#888', fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {([
                { label: "Nom d'utilisateur *", fkey: 'username', placeholder: 'ex: john_doe',       keyboard: 'default',       secure: false },
                { label: 'Email *',              fkey: 'email',    placeholder: 'exemple@email.com',  keyboard: 'email-address', secure: false },
                { label: 'Mot de passe * (min. 6)', fkey: 'password', placeholder: '••••••••',       keyboard: 'default',       secure: true  },
                { label: 'Téléphone (optionnel)',fkey: 'phone',    placeholder: '+216 XX XXX XXX',   keyboard: 'phone-pad',     secure: false },
              ] as { label: string; fkey: keyof typeof form; placeholder: string; keyboard: string; secure: boolean }[]).map(f => (
                <View key={String(f.fkey)}>
                  <Text style={[styles.fieldLabel, { color: textSecondary }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor: border }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={textSecondary}
                    value={form[f.fkey]}
                    onChangeText={(v: string) => setForm((prev: typeof form) => ({ ...prev, [f.fkey]: v }))}
                    keyboardType={f.keyboard as any}
                    secureTextEntry={f.secure}
                    autoCapitalize="none"
                  />
                </View>
              ))}

              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Rôle *</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {(['user', 'admin'] as UserRole[]).map(r => {
                  const selected = form.role === r;
                  const color = r === 'admin' ? '#ff6b6b' : '#00d4ff';
                  return (
                    <TouchableOpacity
                      key={String(r)}
                      onPress={() => setForm((f: typeof form) => ({ ...f, role: r }))}
                      style={[styles.roleOption, {
                        borderColor: selected ? color : border,
                        backgroundColor: selected ? color + '22' : inputBg,
                        flex: 1,
                      }]}>
                      <Text style={{ fontSize: 24 }}>{r === 'admin' ? '👑' : '👤'}</Text>
                      <Text style={[styles.roleOptionLabel, { color: selected ? color : textSecondary }]}>
                        {r === 'admin' ? 'Admin' : 'Utilisateur'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {form.role === 'user' && (
                <View style={[styles.infoBox, { backgroundColor: 'rgba(0,212,255,0.08)', borderColor: 'rgba(0,212,255,0.3)' }]}>
                  <Text style={{ color: '#00d4ff', fontSize: 12 }}>
                    ℹ️ L'utilisateur sera créé sans accès. Vous pourrez lui attribuer des permissions après.
                  </Text>
                </View>
              )}
              {form.role === 'admin' && (
                <View style={[styles.infoBox, { backgroundColor: 'rgba(255,107,107,0.08)', borderColor: 'rgba(255,107,107,0.3)' }]}>
                  <Text style={{ color: '#ff6b6b', fontSize: 12 }}>
                    ⚠️ L'admin aura accès à toutes les fonctionnalités sans restriction.
                  </Text>
                </View>
              )}

              {formError ? (
                <View style={styles.errorBox}>
                  <Text style={{ color: '#ff4444', fontSize: 13 }}>⚠️ {formError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.createBtn, formLoading && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={formLoading}>
                {formLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.createBtnText}>✅ Créer le compte</Text>}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal : Permissions ── */}
      <Modal visible={permModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: textPrimary }]}>🔐 Accès de {selectedUser?.username}</Text>
                <Text style={{ color: textSecondary, fontSize: 12, marginTop: 2 }}>
                  Activez les modules auxquels cet utilisateur peut accéder
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPermModal(false)}>
                <Text style={{ color: '#888', fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {PERMISSION_LIST.map(p => (
                <View key={String(p.key)} style={[styles.permRow, { backgroundColor: inputBg, borderColor: border }]}>
                  <View style={[styles.permIcon, { backgroundColor: tempPerms[p.key] ? 'rgba(0,255,136,0.15)' : 'rgba(128,128,128,0.1)' }]}>
                    <Text style={{ fontSize: 22 }}>{p.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: textPrimary }}>{p.label}</Text>
                    <Text style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>{p.desc}</Text>
                  </View>
                  <Switch
                    value={tempPerms[p.key]}
                    onValueChange={(v: boolean) => setTempPerms((prev: PermMap) => ({ ...prev, [p.key]: v }))}
                    trackColor={{ false: '#333', true: 'rgba(0,255,136,0.4)' }}
                    thumbColor={tempPerms[p.key] ? '#00ff88' : '#888'}
                  />
                </View>
              ))}

              <View style={[styles.infoBox, { backgroundColor: 'rgba(123,47,247,0.1)', borderColor: 'rgba(123,47,247,0.3)', marginTop: 8 }]}>
                <Text style={{ color: '#a78bfa', fontSize: 12 }}>
                  {Object.values(tempPerms).filter(Boolean).length} accès activé(s) sur {PERMISSION_LIST.length}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.createBtn, savingPerms && { opacity: 0.6 }]}
                onPress={handleSavePerms}
                disabled={savingPerms}>
                {savingPerms
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.createBtnText}>💾 Sauvegarder les accès</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={{ padding: 14, alignItems: 'center' }} onPress={() => setPermModal(false)}>
                <Text style={{ color: textSecondary, fontSize: 14 }}>Annuler</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  header:          { padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#7b2ff7' },
  headerTitle:     { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub:       { color: '#a78bfa', fontSize: 12, marginTop: 2 },
  addBtn:          { backgroundColor: '#7b2ff7', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  addBtnText:      { color: '#fff', fontSize: 24, lineHeight: 28 },
  statsRow:        { flexDirection: 'row', padding: 10, gap: 8 },
  statCard:        { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 3 },
  statValue:       { fontSize: 22, fontWeight: 'bold' },
  statLabel:       { fontSize: 10, marginTop: 4 },
  searchBox:       { marginHorizontal: 10, marginBottom: 10, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1 },
  searchInput:     { flex: 1, fontSize: 14 },
  userCard:        { marginHorizontal: 10, marginBottom: 10, borderRadius: 14, padding: 14, borderLeftWidth: 4 },
  userTop:         { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar:          { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  userInfo:        { flex: 1 },
  userName:        { fontSize: 15, fontWeight: 'bold' },
  meBadge:         { backgroundColor: '#7b2ff7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontSize: 9, color: '#fff', fontWeight: 'bold' },
  roleBadge:       { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  roleBadgeText:   { fontSize: 11, fontWeight: 'bold' },
  permsPreview:    { flexDirection: 'row', borderRadius: 10, padding: 10, marginBottom: 10, gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  permChip:        { alignItems: 'center', gap: 2 },
  permChipText:    { fontSize: 10, fontWeight: 'bold' },
  actions:         { flexDirection: 'row', gap: 8 },
  actionBtn:       { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  actionBtnText:   { fontSize: 13, fontWeight: '600' },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%', borderTopWidth: 2, borderTopColor: '#7b2ff7' },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle:      { fontSize: 18, fontWeight: 'bold' },
  fieldLabel:      { fontSize: 12, marginBottom: 6, marginTop: 12 },
  input:           { borderRadius: 12, borderWidth: 1, padding: 13, fontSize: 14, marginBottom: 2 },
  roleOption:      { borderRadius: 12, borderWidth: 2, padding: 14, alignItems: 'center', gap: 6 },
  roleOptionLabel: { fontSize: 13, fontWeight: 'bold' },
  permRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  permIcon:        { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  infoBox:         { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 12 },
  errorBox:        { backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: 10, padding: 12, marginBottom: 12 },
  createBtn:       { backgroundColor: '#7b2ff7', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  createBtnText:   { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});

export default UserManagementScreen;