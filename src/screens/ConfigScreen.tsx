import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onValue, ref, remove, set, update } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, PanResponder,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { database } from '../config/firebase';
import { DEFAULT_PERMISSIONS, Permission, useAuth } from '../context/AuthContext';
import { useCameras } from '../context/CameraContext';
import { AppTheme, Theme, useTheme } from '../context/ThemeContext';

// ─── Static data (no C references) ───────────────────────────────────────────
const defaultEquipements = [
  { id: '1', name: 'EZVIZ',         type: 'Caméra IP',       status: 'online',  ip: '172.20.10.4'    },
  { id: '2', name: 'DVR Hikvision', type: '4 canaux',        status: 'online',  ip: '192.168.1.15'   },
  { id: '3', name: 'Backend PC',    type: 'Serveur Node.js', status: 'online',  ip: '192.168.0.213'  },
  { id: '4', name: 'Routeur',       type: 'Réseau',          status: 'online',  ip: '192.168.0.1'    },
  { id: '5', name: 'Raspberry Pi',  type: 'Serveur IoT',     status: 'online',  ip: '100.103.171.77' },
  { id: '6', name: 'ESP32',         type: 'Capteur IoT',     status: 'offline', ip: '---'            },
];

// events use plain hex so no C dependency
const EVENTS_STATIC = [
  { id: '1', text: 'Caméra EZVIZ connectée',  time: 'Il y a 2 min',  colorKey: 'online',     icon: 'video'        },
  { id: '2', text: 'Connexion admin réussie',  time: 'Il y a 5 min',  colorKey: 'cyan',        icon: 'log-in'       },
  { id: '3', text: 'Système démarré',          time: 'Il y a 10 min', colorKey: 'warn',        icon: 'power'        },
  { id: '4', text: 'Réseau local détecté',     time: 'Il y a 12 min', colorKey: 'cyan',        icon: 'wifi'         },
  { id: '5', text: 'Backend opérationnel',     time: 'Il y a 15 min', colorKey: 'online',      icon: 'check-circle' },
] as const;

const RASPBERRY_IP  = '100.103.171.77';
const RASPBERRY_API = `http://${RASPBERRY_IP}:5000`;
const EZVIZ_SERVER  = `http://${RASPBERRY_IP}:3001`;

// ─── Keys only — colors resolved inside component where C is available ────────
const EZVIZ_ICON_MAP: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  PIR: 'eye', DOOR: 'unlock', BUTTON: 'radio', Camera: 'video', Gateway: 'home',
};
const EZVIZ_COLOR_KEYS: Record<string, string> = {
  PIR: 'offline', DOOR: 'warn', BUTTON: 'cyan', Camera: 'accentGlow', Gateway: 'online',
};

type UserRole = 'admin' | 'security' | 'user';
interface ZKDevice    { id: string; name: string; ip: string; port: number; active: boolean; status: 'online'|'offline'|'unknown'; lastSync?: string; userCount?: number; }
interface EzvizDevice { serial: string; name: string; type: string; category: string; subCategory: string; online: boolean; version: string; }
interface FirebaseUser{ uid: string; username: string; email: string; role: UserRole; phone?: string; createdAt?: string; permissions?: Permission[]; }

const ROLE_LABEL: Record<UserRole, string>                                   = { admin: 'Administrateur', security: 'Sécurité', user: 'Utilisateur' };
const ROLE_COLOR_KEYS: Record<UserRole, string>                         = { admin: 'gold', security: 'cyan', user: 'accentGlow' };
const ROLE_ICON_NAME:  Record<UserRole, React.ComponentProps<typeof Feather>['name']> = { admin: 'shield', security: 'lock', user: 'user' };

const equipIcon = (name: string): React.ComponentProps<typeof Feather>['name'] => {
  if (name.includes('EZVIZ') || name.includes('DVR')) return 'video';
  if (name.includes('PC') || name.includes('Backend')) return 'monitor';
  if (name.includes('Routeur')) return 'wifi';
  if (name.includes('Raspberry')) return 'server';
  if (name.includes('ESP')) return 'cpu';
  return 'box';
};

// ─── Collapsible section button ───────────────────────────────────────────────
// Receives s and C explicitly — no module-level access
interface SectionBtnProps {
  label: string; sub: string;
  iconName: React.ComponentProps<typeof Feather>['name'];
  accentColor: string; open: boolean; onPress: () => void;
  badgeText?: string;
  s: ReturnType<typeof makeStyles>; C: Theme;
}
const SectionBtn = ({ label, sub, iconName, accentColor, open, onPress, badgeText, s, C }: SectionBtnProps) => (
  <TouchableOpacity style={[s.mainBtn, { borderLeftColor: accentColor }]} onPress={onPress} activeOpacity={0.8}>
    <View style={s.mainBtnLeft}>
      <View style={[s.mainBtnIconBox, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }]}>
        <Feather name={iconName} size={20} color={accentColor} />
      </View>
      <View>
        <Text style={s.mainBtnTitle}>{label}</Text>
        <Text style={s.mainBtnSub}>{sub}</Text>
      </View>
    </View>
    {badgeText
      ? <View style={[s.sectionBadge, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }]}>
          <Text style={[s.sectionBadgeText, { color: accentColor }]}>{badgeText}</Text>
        </View>
      : <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
    }
  </TouchableOpacity>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
// ─── Swipe-to-dismiss helper ─────────────────────────────────────────────────
const useSwipeToDismiss = (onClose: () => void) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          Animated.timing(translateY, { toValue: 600, duration: 200, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;
  return { translateY, panResponder };
};

const ConfigScreen = () => {
  const C = useTheme();
  const s = makeStyles(C);

  // Resolve dynamic color maps inside component where C is available
  const EZVIZ_COLORS: Record<string, string> = Object.fromEntries(
    Object.entries(EZVIZ_COLOR_KEYS).map(([k, v]) => [k, C[v] as string])
  );
  const ROLE_COLOR: Record<UserRole, string> = {
    admin:    C[ROLE_COLOR_KEYS.admin]    as string,
    security: C[ROLE_COLOR_KEYS.security] as string,
    user:     C[ROLE_COLOR_KEYS.user]     as string,
  };
  const events = EVENTS_STATIC.map(e => ({ ...e, color: C[e.colorKey as keyof Theme] as string }));

  const [showEquipements, setShowEquipements] = useState(false);
  const [showHistorique,  setShowHistorique]  = useState(false);
  const [showCameras,     setShowCameras]     = useState(false);
  const [showProfil,      setShowProfil]      = useState(false);
  const [showPointeuses,  setShowPointeuses]  = useState(false);
  const [showEzviz,       setShowEzviz]       = useState(false);
  const [showUsers,       setShowUsers]       = useState(false);

  const [modalVisible,        setModalVisible]        = useState(false);
  const [profilModalVisible,  setProfilModalVisible]  = useState(false);
  const [zkModalVisible,      setZkModalVisible]      = useState(false);
  const [ezvizModalVisible,   setEzvizModalVisible]   = useState(false);
  const [userModalVisible,    setUserModalVisible]    = useState(false);
  const [addUserModalVisible, setAddUserModalVisible] = useState(false);
  const [activeTab,           setActiveTab]           = useState<'info' | 'password'>('info');

  // ZKTeco
  const [zkDevices,    setZkDevices]    = useState<ZKDevice[]>([]);
  const [addingDevice, setAddingDevice] = useState(false);
  const [zkId,   setZkId]   = useState('');
  const [zkName, setZkName] = useState('');
  const [zkIp,   setZkIp]   = useState('');
  const [zkPort, setZkPort] = useState('4370');

  // EZVIZ
  const [ezvizScanned,   setEzvizScanned]   = useState<EzvizDevice[]>([]);
  const [ezvizMonitored, setEzvizMonitored] = useState<Record<string, any>>({});
  const [scanningEzviz,  setScanningEzviz]  = useState(false);
  const [addingEzviz,    setAddingEzviz]    = useState(false);
  const [manualSerial,   setManualSerial]   = useState('');
  const [manualName,     setManualName]     = useState('');
  const [manualType,     setManualType]     = useState('PIR');

  // Camera
  const [addingCamera, setAddingCamera] = useState(false);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);

  // Users
  const [firebaseUsers,    setFirebaseUsers]    = useState<FirebaseUser[]>([]);
  const [loadingUsers,     setLoadingUsers]     = useState(false);
  const [selectedUser,     setSelectedUser]     = useState<FirebaseUser | null>(null);
  const [editRole,         setEditRole]         = useState<UserRole>('user');
  const [savingRole,       setSavingRole]       = useState(false);
  const [deletingUserId,   setDeletingUserId]   = useState<string | null>(null);
  const [addUsername,    setAddUsername]    = useState('');
  const [addEmail,       setAddEmail]       = useState('');
  const [addPhone,       setAddPhone]       = useState('');
  const [addPassword,    setAddPassword]    = useState('');
  const [addRole,        setAddRole]        = useState<UserRole>('user');
  const [addingUser,     setAddingUser]     = useState(false);

  // Permissions management
  const [editPermissions, setEditPermissions] = useState<Permission[]>([]);
  const [savingPerms,     setSavingPerms]     = useState(false);
  const [addUserError,   setAddUserError]   = useState('');
  const [addUserSuccess, setAddUserSuccess] = useState('');

  const router = useRouter();
  const { cameras, addCamera, deleteCamera, networkMode, switchNetwork } = useCameras();
  const authCtx = useAuth();
  const { user, updateProfile, changePassword, register, darkMode, toggleDarkMode, updatePermissions } = authCtx;


  const [editUsername,   setEditUsername]   = useState(user?.username || '');
  const [editPhone,      setEditPhone]      = useState(user?.phone    || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError,   setProfileError]   = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [editCurrentPass, setEditCurrentPass] = useState('');
  const [editPass,        setEditPass]        = useState('');
  const [editPassConfirm, setEditPassConfirm] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass,     setShowNewPass]     = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError,   setPassError]   = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  const [newName,    setNewName]    = useState('');
  const [newIp,      setNewIp]      = useState('');
  const [newUser,    setNewUser]    = useState('admin');
  const [newPass,    setNewPass]    = useState('');
  const [newPort,    setNewPort]    = useState('554');
  const [newPath,    setNewPath]    = useState('');
  const [newType,    setNewType]    = useState<'ip' | 'dvr' | 'nvr'>('ip');
  const [newChannel, setNewChannel] = useState('1');

  useEffect(() => {
    const unsub = onValue(ref(database, 'zkteco_devices'), (snap) => {
      const data = snap.val();
      if (!data) { setZkDevices([]); return; }
      setZkDevices(Object.entries(data).map(([id, d]: any) => ({ id, ...d })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    setLoadingUsers(true);
    const unsub = onValue(ref(database, 'users'), (snap) => {
      const data = snap.val();
      if (!data) { setFirebaseUsers([]); setLoadingUsers(false); return; }
      const list: FirebaseUser[] = Object.entries(data).map(([uid, d]: any) => ({ uid, ...d }));
      const order: Record<UserRole, number> = { admin: 0, security: 1, user: 2 };
      list.sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3));
      setFirebaseUsers(list); setLoadingUsers(false);
    });
    return () => unsub();
  }, [user?.role]);

  const resetForm        = () => { setNewName(''); setNewIp(''); setNewUser('admin'); setNewPass(''); setNewPort('554'); setNewPath(''); setNewType('ip'); setNewChannel('1'); };
  const resetPassForm    = () => { setEditCurrentPass(''); setEditPass(''); setEditPassConfirm(''); setPassError(''); setPassSuccess(''); };
  const resetProfileForm = () => { setEditUsername(user?.username || ''); setEditPhone(user?.phone || ''); setProfileError(''); setProfileSuccess(''); };
  const resetZkForm      = () => { setZkId(''); setZkName(''); setZkIp(''); setZkPort('4370'); };
  const resetEzvizForm   = () => { setManualSerial(''); setManualName(''); setManualType('PIR'); };
  const resetAddUserForm = () => { setAddUsername(''); setAddEmail(''); setAddPhone(''); setAddPassword(''); setAddRole('user'); setAddUserError(''); setAddUserSuccess(''); };

  const openModal = () => { resetProfileForm(); resetPassForm(); setActiveTab('info'); setProfilModalVisible(true); };

  // ── Swipe-to-dismiss for each modal ──
  const swipeUser     = useSwipeToDismiss(() => setUserModalVisible(false));
  const swipeAddUser  = useSwipeToDismiss(() => { setAddUserModalVisible(false); resetAddUserForm(); });
  const swipeEzviz    = useSwipeToDismiss(() => { setEzvizModalVisible(false);   resetEzvizForm();   });
  const swipeZk       = useSwipeToDismiss(() => { setZkModalVisible(false);      resetZkForm();      });
  const swipeCamera   = useSwipeToDismiss(() => { setModalVisible(false);        resetForm();        });
  const swipeProfil   = useSwipeToDismiss(() => setProfilModalVisible(false));

  const handleAddDevice = async () => {
    if (!zkId.trim() || !zkName.trim() || !zkIp.trim()) { Alert.alert('Erreur', 'ID, Nom et IP sont obligatoires.'); return; }
    setAddingDevice(true);
    try {
      const res = await fetch(`${RASPBERRY_API}/device/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: zkId.trim(), name: zkName.trim(), ip: zkIp.trim(), port: parseInt(zkPort) || 4370 }) });
      const result = await res.json();
      if (result.success) { Alert.alert('Pointeuse ajoutée', result.message); resetZkForm(); setZkModalVisible(false); }
      else Alert.alert('Erreur connexion', result.message);
    } catch (e: any) { Alert.alert('Erreur', `Impossible de joindre le Raspberry.\n${e.message}`); }
    finally { setAddingDevice(false); }
  };

  const handleDeleteDevice = (device: ZKDevice) =>
    Alert.alert('Supprimer', `Supprimer la pointeuse "${device.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await remove(ref(database, `zkteco_devices/${device.id}`)); }
        catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);

  const scanEzvizDevices = async () => {
    setScanningEzviz(true);
    try {
      const [sr, mr] = await Promise.all([fetch(`${EZVIZ_SERVER}/ezviz/scan`), fetch(`${EZVIZ_SERVER}/ezviz/monitored`)]);
      const sd = await sr.json(); const md = await mr.json();
      if (sd.success) setEzvizScanned(sd.devices);
      if (md.success) setEzvizMonitored(md.sensors);
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    setScanningEzviz(false);
  };

  const addEzvizSensor = async (serial: string, name: string, type: string) => {
    if (!serial || !name) { Alert.alert('Erreur', 'Serial et Nom sont obligatoires'); return; }
    setAddingEzviz(true);
    try {
      const res = await fetch(`${EZVIZ_SERVER}/ezviz/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial, name, type }) });
      const data = await res.json();
      if (data.success) { Alert.alert('Capteur ajouté', `"${name}" est maintenant surveillé !`); await scanEzvizDevices(); setEzvizModalVisible(false); resetEzvizForm(); }
      else Alert.alert('Erreur', data.error || "Échec de l'ajout");
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    setAddingEzviz(false);
  };

  const removeEzvizSensor = (serial: string, name: string) =>
    Alert.alert('Supprimer', `Arrêter la surveillance de "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await fetch(`${EZVIZ_SERVER}/ezviz/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial }) }); await scanEzvizDevices(); }
        catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);

  const formatSync = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Jamais';

  const handleSaveProfile = async () => {
    setProfileError(''); setProfileSuccess('');
    if (!editUsername.trim()) { setProfileError("Le nom d'utilisateur ne peut pas être vide."); return; }
    setProfileLoading(true);
    const result = await updateProfile({ username: editUsername.trim(), phone: editPhone.trim() });
    setProfileLoading(false);
    if (result.success) { setProfileSuccess('Profil mis à jour !'); setTimeout(() => setProfileSuccess(''), 3000); }
    else setProfileError(result.error || 'Erreur inconnue.');
  };

  const handleSavePassword = async () => {
    setPassError(''); setPassSuccess('');
    if (!editCurrentPass) { setPassError('Entrez votre mot de passe actuel.'); return; }
    if (editPass.length < 6) { setPassError('Min. 6 caractères.'); return; }
    if (editPass !== editPassConfirm) { setPassError('Les mots de passe ne correspondent pas.'); return; }
    setPassLoading(true);
    const result = await changePassword(editCurrentPass, editPass);
    setPassLoading(false);
    if (result.success) { setPassSuccess('Mot de passe changé !'); resetPassForm(); setTimeout(() => setPassSuccess(''), 2000); }
    else setPassError(result.error || 'Erreur inconnue.');
  };

  const buildUri = () => {
    if (newType === 'dvr') return `rtsp://${newUser}:${newPass}@${newIp}:${newPort}/Streaming/Channels/${String(parseInt(newChannel) * 100 + 1)}`;
    if (newType === 'nvr') return `rtsp://${newUser}:${newPass}@${newIp}:${newPort}/cam/realmonitor?channel=${newChannel}&subtype=0&unicast=true&proto=Onvif`;
    return `rtsp://${newUser}:${newPass}@${newIp}:${newPort}/${newPath}`;
  };

  const toStreamName = (n: string) => n.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');

  const handleAddCamera = async () => {
    if (!newName || !newIp || !newPass) { Alert.alert('Erreur', 'Remplis : Nom, IP et Mot de passe'); return; }
    setAddingCamera(true);
    const uri = buildUri(); const streamName = toStreamName(newName);
    const cam = { id: `c${Date.now()}`, name: newName, ip: newIp, uri, uriLocal: uri, uriTailscale: `rtsp://${RASPBERRY_IP}:8554/${streamName}`, location: newType === 'dvr' ? 'DVR' : newType === 'nvr' ? 'NVR' : 'Maison' };
    try {
      const result = await addCamera(cam);
      setAddingCamera(false); setModalVisible(false); resetForm();
      Alert.alert(result.success ? 'Caméra ajoutée' : 'Partiellement ajoutée', result.success ? `"${newName}" sauvegardée !` : 'Firebase OK, Raspberry non joignable.');
    } catch { setAddingCamera(false); Alert.alert('Erreur', "Impossible d'ajouter la caméra."); }
  };

  const handleDeleteCamera = (id: string) => {
    const cam = cameras.find(c => c.id === id);
    Alert.alert('Supprimer', `Supprimer "${cam?.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        setDeletingId(id);
        try { await deleteCamera(id); } catch {}
        setDeletingId(null);
      }},
    ]);
  };

  const openUserDetail = (u: FirebaseUser) => {
    setSelectedUser(u);
    setEditRole(u.role);
    // Load existing permissions or defaults for the role
    const perms = (u as any).permissions ?? DEFAULT_PERMISSIONS[u.role] ?? [];
    setEditPermissions(perms);
    setUserModalVisible(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    setSavingPerms(true);
    try {
      const result = await updatePermissions(selectedUser.uid, editPermissions);
      if (result.success) Alert.alert('✅ Accès mis à jour', `Permissions de "${selectedUser.username}" sauvegardées.`);
      else Alert.alert('Erreur', result.error || 'Erreur inconnue');
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setSavingPerms(false); }
  };

  const togglePermission = (perm: Permission) => {
    setEditPermissions((prev: Permission[]) =>
      prev.includes(perm) ? prev.filter((p: Permission) => p !== perm) : [...prev, perm]
    );
  };

  const handleSaveRole  = async () => {
    if (!selectedUser) return;
    if (selectedUser.uid === user?.uid) { Alert.alert('', 'Vous ne pouvez pas modifier votre propre rôle.'); return; }
    setSavingRole(true);
    try { await update(ref(database, `users/${selectedUser.uid}`), { role: editRole }); Alert.alert('Rôle mis à jour', `${selectedUser.username} → "${ROLE_LABEL[editRole]}".`); setUserModalVisible(false); }
    catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setSavingRole(false); }
  };

  const handleDeleteUser = (u: FirebaseUser) => {
    if (u.uid === user?.uid) { Alert.alert('', 'Vous ne pouvez pas supprimer votre propre compte.'); return; }
    Alert.alert('Supprimer', `Supprimer "${u.username}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        setDeletingUserId(u.uid);
        try {
          await remove(ref(database, `users/${u.uid}`));
          if (u.username) await set(ref(database, `usernames/${u.username}`), null);
          if (u.phone)    await set(ref(database, `phones/${u.phone}`), null);
          Alert.alert('Supprimé', `"${u.username}" supprimé.`);
          setUserModalVisible(false);
        } catch (e: any) { Alert.alert('Erreur', e.message); }
        finally { setDeletingUserId(null); }
      }},
    ]);
  };

  const handleAddUser = async () => {
    setAddUserError(''); setAddUserSuccess('');
    if (!addUsername.trim() || !addEmail.trim() || !addPassword.trim()) { setAddUserError('Nom, email et mot de passe sont obligatoires.'); return; }
    if (addPassword.length < 6) { setAddUserError('Min. 6 caractères.'); return; }
    setAddingUser(true);
    const result = await register(addUsername.trim(), addEmail.trim(), addPassword, addRole as any, addPhone.trim() ? `+216${addPhone.trim()}` : undefined);
    setAddingUser(false);
    if (result.success) { setAddUserSuccess(`"${addUsername}" créé !`); resetAddUserForm(); setTimeout(() => { setAddUserSuccess(''); setAddUserModalVisible(false); }, 2000); }
    else setAddUserError(result.error || 'Erreur inconnue.');
  };

  const userRoleStr  = user?.role as string | undefined;
  const roleColor    = userRoleStr === 'admin' ? C.gold : userRoleStr === 'security' ? C.cyan : C.accentGlow;
  const roleLabel    = userRoleStr === 'admin' ? 'Administrateur' : userRoleStr === 'security' ? 'Sécurité' : 'Utilisateur';
  const passStrength = editPass.length === 0 ? 0 : editPass.length < 6 ? 1 : editPass.length < 10 ? 2 : 3;
  const passStrengthColor = [C.border, C.offline, C.warn, C.online][passStrength];
  const passStrengthLabel = ['', 'Trop court', 'Moyen', 'Fort'][passStrength];

  // Inline input helper
  const FInput = ({ value, onChangeText, placeholder, secure, kb, cap }: any) => (
    <TextInput
      style={s.formInput}
      value={value} onChangeText={onChangeText}
      placeholder={placeholder} placeholderTextColor={C.textMuted}
      secureTextEntry={secure} keyboardType={kb ?? 'default'} autoCapitalize={cap ?? 'none'}
    />
  );

  // SectionBtn shortcut — s and C already in scope
  const Sec = (props: Omit<SectionBtnProps, 's' | 'C'>) => <SectionBtn {...props} s={s} C={C} />;

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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="settings" size={17} color={C.accentGlow} />
              <Text style={s.headerTitle}> Configuration</Text>
            </View>
            <Text style={s.headerSub}>Profil · Caméras · EZVIZ · Pointeuses</Text>
          </View>
        </View>
      </View>

      {/* Profile card */}
      <View style={s.profilCard}>
        <View style={[s.avatarBox, { borderColor: roleColor }]}>
          <Feather name={userRoleStr === 'admin' ? 'shield' : userRoleStr === 'security' ? 'lock' : 'user'} size={26} color={roleColor} />
        </View>
        <View style={s.profilInfo}>
          <Text style={s.profilName}>{user?.username}</Text>
          <Text style={[s.profilRole, { color: roleColor }]}>{roleLabel}</Text>
          <Text style={s.profilEmail}>{user?.email}</Text>
          {user?.phone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
              <Feather name="phone" size={10} color={C.textMuted} />
              <Text style={s.profilEmail}>{user.phone}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity style={s.editProfilBtn} onPress={openModal}>
          <Feather name="edit-2" size={13} color={C.accentGlow} />
          <Text style={s.editProfilBtnText}> Modifier</Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 12 }}>

        {/* Profil */}
        <Sec label="Profil utilisateur" sub={`${user?.username} · ${user?.role}`} iconName="user" accentColor={C.cyan} open={showProfil} onPress={() => setShowProfil(!showProfil)} />
        {showProfil && (
          <View style={s.expandedCard}>
            {[
              { label: "Nom d'utilisateur", value: user?.username, icon: 'user'   as const },
              { label: 'Rôle',              value: user?.role,     icon: 'shield' as const },
              { label: 'Email',             value: user?.email,    icon: 'mail'   as const },
              { label: 'Téléphone',         value: user?.phone || 'Non renseigné', icon: 'phone' as const },
            ].map((row, i, arr) => (
              <View key={row.label}>
                <View style={s.infoRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name={row.icon} size={13} color={C.textMuted} />
                    <Text style={s.infoLabel}>{row.label}</Text>
                  </View>
                  <Text style={s.infoValue}>{row.value}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.divider} />}
              </View>
            ))}
            <TouchableOpacity style={s.editBtn} onPress={openModal}>
              <Feather name="edit-2" size={14} color="#fff" />
              <Text style={s.editBtnText}> Modifier le profil</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Users (admin only) */}
        {user?.role === 'admin' && (
          <>
            <Sec label="Gestion des utilisateurs" sub={loadingUsers ? 'Chargement...' : `${firebaseUsers.length} compte(s)`} iconName="users" accentColor={C.gold} open={showUsers} onPress={() => setShowUsers(!showUsers)} badgeText="Admin" />
            {showUsers && (
              <View style={s.expandedCard}>
                <View style={s.statsRow}>
                  {[
                    { label: 'Admins',       val: firebaseUsers.filter(u => u.role === 'admin').length,    color: C.gold       },
                    { label: 'Sécurité',     val: firebaseUsers.filter(u => u.role === 'security').length, color: C.cyan       },
                    { label: 'Utilisateurs', val: firebaseUsers.filter(u => u.role === 'user').length,     color: C.accentGlow },
                  ].map(st => (
                    <View key={st.label} style={[s.netStat, { borderLeftColor: st.color }]}>
                      <Text style={[s.netStatValue, { color: st.color }]}>{st.val}</Text>
                      <Text style={s.netStatLabel}>{st.label}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={[s.addBtn, { backgroundColor: `${C.gold}22`, borderColor: `${C.gold}55` }]} onPress={() => { resetAddUserForm(); setAddUserModalVisible(true); }}>
                  <Feather name="user-plus" size={15} color={C.gold} />
                  <Text style={[s.addBtnText, { color: C.gold }]}> Ajouter un utilisateur</Text>
                </TouchableOpacity>
                {loadingUsers ? <ActivityIndicator color={C.gold} style={{ marginVertical: 20 }} /> :
                  firebaseUsers.map((u, i) => {
                    const rc = ROLE_COLOR[u.role] || C.textMuted;
                    const isSelf = u.uid === user?.uid;
                    return (
                      <TouchableOpacity key={u.uid} style={[s.userRow, i < firebaseUsers.length - 1 && s.rowBorder]} onPress={() => openUserDetail(u)} activeOpacity={0.75}>
                        <View style={[s.userAvatarBox, { backgroundColor: `${rc}18`, borderColor: `${rc}55` }]}>
                          <Feather name={ROLE_ICON_NAME[u.role]} size={18} color={rc} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.equipName}>{u.username}</Text>
                            {isSelf && <View style={s.selfBadge}><Text style={s.selfBadgeText}>Moi</Text></View>}
                          </View>
                          <Text style={s.equipType}>{u.email}</Text>
                        </View>
                        <View style={[s.equipBadge, { backgroundColor: `${rc}18` }]}>
                          <Text style={[s.equipStatus, { color: rc }]}>{ROLE_LABEL[u.role]}</Text>
                        </View>
                        {!isSelf && (
                          deletingUserId === u.uid
                            ? <ActivityIndicator size="small" color={C.offline} style={{ marginLeft: 8 }} />
                            : <TouchableOpacity style={s.deleteBtn} onPress={() => handleDeleteUser(u)}>
                                <Feather name="trash-2" size={14} color={C.offline} />
                              </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    );
                  })
                }
              </View>
            )}
          </>
        )}

        {/* Thème */}
        <TouchableOpacity style={[s.mainBtn, { borderLeftColor: darkMode ? C.accentGlow : C.warn }]} onPress={toggleDarkMode} activeOpacity={0.8}>
          <View style={s.mainBtnLeft}>
            <View style={[s.mainBtnIconBox, { backgroundColor: darkMode ? `${C.accentGlow}18` : `${C.warn}18`, borderColor: darkMode ? `${C.accentGlow}44` : `${C.warn}44` }]}>
              <Feather name={darkMode ? 'moon' : 'sun'} size={20} color={darkMode ? C.accentGlow : C.warn} />
            </View>
            <View>
              <Text style={s.mainBtnTitle}>Mode d'affichage</Text>
              <Text style={s.mainBtnSub}>{darkMode ? 'Mode sombre activé' : 'Mode clair activé'}</Text>
            </View>
          </View>
          <View style={[s.togglePill, { backgroundColor: darkMode ? `${C.accentGlow}22` : `${C.warn}22`, borderColor: darkMode ? `${C.accentGlow}55` : `${C.warn}55` }]}>
            <Feather name={darkMode ? 'moon' : 'sun'} size={12} color={darkMode ? C.accentGlow : C.warn} />
            <Text style={[s.togglePillText, { color: darkMode ? C.accentGlow : C.warn }]}>{darkMode ? ' Sombre' : ' Clair'}</Text>
          </View>
        </TouchableOpacity>

        {/* Réseau */}
        <TouchableOpacity
          style={[s.mainBtn, { borderLeftColor: networkMode === 'tailscale' ? C.online : C.warn }]}
          onPress={() => Alert.alert('Mode réseau', `Passer en mode ${networkMode === 'local' ? 'Tailscale' : 'Local'} ?`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Confirmer', onPress: () => switchNetwork(networkMode === 'local' ? 'tailscale' : 'local') },
          ])}
        >
          <View style={s.mainBtnLeft}>
            <View style={[s.mainBtnIconBox, { backgroundColor: `${networkMode === 'tailscale' ? C.online : C.warn}18`, borderColor: `${networkMode === 'tailscale' ? C.online : C.warn}44` }]}>
              <Feather name={networkMode === 'tailscale' ? 'globe' : 'home'} size={20} color={networkMode === 'tailscale' ? C.online : C.warn} />
            </View>
            <View>
              <Text style={s.mainBtnTitle}>Mode réseau</Text>
              <Text style={s.mainBtnSub}>{networkMode === 'tailscale' ? `Tailscale · ${RASPBERRY_IP}` : 'Local · 192.168.x.x'}</Text>
            </View>
          </View>
          <View style={[s.togglePill, { backgroundColor: networkMode === 'tailscale' ? `${C.online}22` : `${C.warn}22`, borderColor: networkMode === 'tailscale' ? `${C.online}55` : `${C.warn}55` }]}>
            <Text style={[s.togglePillText, { color: networkMode === 'tailscale' ? C.online : C.warn }]}>{networkMode === 'tailscale' ? 'Tailscale' : 'Local'}</Text>
          </View>
        </TouchableOpacity>

        {/* Cameras */}
        <Sec label="Gestion des caméras" sub={`${cameras.length} caméra(s)`} iconName="video" accentColor={C.accentGlow} open={showCameras} onPress={() => setShowCameras(!showCameras)} />
        {showCameras && (
          <View style={s.expandedCard}>
            <View style={[s.modeBadge, { backgroundColor: networkMode === 'tailscale' ? `${C.online}12` : `${C.warn}12`, borderColor: networkMode === 'tailscale' ? `${C.online}33` : `${C.warn}33` }]}>
              <Feather name={networkMode === 'tailscale' ? 'globe' : 'home'} size={12} color={networkMode === 'tailscale' ? C.online : C.warn} />
              <Text style={[s.modeBadgeText, { color: networkMode === 'tailscale' ? C.online : C.warn }]}>{networkMode === 'tailscale' ? ' Mode Tailscale — via Raspberry Pi' : ' Mode Local — réseau direct'}</Text>
            </View>
            <TouchableOpacity style={s.addBtn} onPress={() => setModalVisible(true)}>
              <Feather name="plus" size={15} color={C.accentGlow} />
              <Text style={[s.addBtnText, { color: C.accentGlow }]}> Ajouter une caméra</Text>
            </TouchableOpacity>
            {cameras.map((cam, i) => (
              <View key={cam.id} style={[s.equipRow, i < cameras.length - 1 && s.rowBorder]}>
                <View style={s.equipIconBox}><Feather name="video" size={20} color={C.accentGlow} /></View>
                <View style={s.equipInfo}>
                  <Text style={s.equipName}>{cam.name}</Text>
                  <Text style={s.equipType}>{cam.location} · {cam.ip}</Text>
                  <Text style={s.camUri} numberOfLines={1}>{cam.uri}</Text>
                </View>
                <TouchableOpacity style={[s.deleteBtn, deletingId === cam.id && { opacity: 0.5 }]} onPress={() => handleDeleteCamera(cam.id)} disabled={deletingId === cam.id}>
                  {deletingId === cam.id ? <ActivityIndicator size="small" color={C.offline} /> : <Feather name="trash-2" size={15} color={C.offline} />}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* EZVIZ */}
        <Sec label="Capteurs EZVIZ" sub={`${Object.keys(ezvizMonitored).length} surveillé(s) · ${ezvizScanned.length} détecté(s)`} iconName="radio" accentColor={C.cyan} open={showEzviz} onPress={() => { setShowEzviz(!showEzviz); if (!showEzviz) scanEzvizDevices(); }} />
        {showEzviz && (
          <View style={s.expandedCard}>
            <View style={s.statsRow}>
              {[
                { label: 'Surveillés', val: Object.keys(ezvizMonitored).length,      color: C.online     },
                { label: 'Détectés',   val: ezvizScanned.length,                     color: C.cyan       },
                { label: 'En ligne',   val: ezvizScanned.filter(d => d.online).length, color: C.accentGlow },
              ].map(st => (
                <View key={st.label} style={[s.netStat, { borderLeftColor: st.color }]}>
                  <Text style={[s.netStatValue, { color: st.color }]}>{st.val}</Text>
                  <Text style={s.netStatLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity style={[s.addBtn, { flex: 1, backgroundColor: `${C.accent}22`, borderColor: `${C.accent}44` }]} onPress={scanEzvizDevices} disabled={scanningEzviz}>
                {scanningEzviz ? <ActivityIndicator color={C.accentGlow} size="small" /> : <><Feather name="search" size={14} color={C.accentGlow} /><Text style={[s.addBtnText, { color: C.accentGlow }]}> Scanner</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.addBtn, { flex: 1, backgroundColor: `${C.cyan}18`, borderColor: `${C.cyan}44` }]} onPress={() => setEzvizModalVisible(true)}>
                <Feather name="plus" size={14} color={C.cyan} /><Text style={[s.addBtnText, { color: C.cyan }]}> Manuel</Text>
              </TouchableOpacity>
            </View>
            {ezvizScanned.length === 0 && !scanningEzviz && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Feather name="radio" size={32} color={C.textMuted} style={{ marginBottom: 8 }} />
                <Text style={[s.equipType, { textAlign: 'center' }]}>Appuie sur Scanner pour détecter les appareils EZVIZ</Text>
              </View>
            )}
            {ezvizScanned.map((device, i) => {
              const isMonitored = !!ezvizMonitored[device.serial];
              const color    = EZVIZ_COLORS[device.type] || C.textMuted;
              const iconName = EZVIZ_ICON_MAP[device.type] || 'radio';
              return (
                <View key={device.serial} style={[s.equipRow, i < ezvizScanned.length - 1 && s.rowBorder]}>
                  <View style={[s.equipIconBox, { backgroundColor: `${color}18` }]}>
                    <Feather name={iconName} size={20} color={color} />
                  </View>
                  <View style={s.equipInfo}>
                    <Text style={s.equipName}>{device.name}</Text>
                    <Text style={s.equipType}>{device.type} · {device.subCategory}</Text>
                    <Text style={[s.equipType, { fontSize: 10, color: C.border }]}>{device.serial}</Text>
                    {isMonitored && <Text style={[s.equipType, { color: C.online, fontSize: 10 }]}>Surveillance active</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[s.equipBadge, { backgroundColor: device.online ? `${C.online}18` : `${C.offline}18` }]}>
                      <Text style={[s.equipStatus, { color: device.online ? C.online : C.offline }]}>{device.online ? 'En ligne' : 'Hors ligne'}</Text>
                    </View>
                    {device.type !== 'Gateway' && (
                      isMonitored
                        ? <TouchableOpacity style={s.deleteBtn} onPress={() => removeEzvizSensor(device.serial, device.name)}><Feather name="trash-2" size={14} color={C.offline} /></TouchableOpacity>
                        : <TouchableOpacity style={[s.deleteBtn, { backgroundColor: `${C.cyan}18`, borderColor: `${C.cyan}44` }]} onPress={() => addEzvizSensor(device.serial, device.name, device.type)}>
                            <Feather name="plus" size={14} color={C.cyan} />
                          </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ZKTeco */}
        <Sec label="Pointeuses ZKTeco" sub={`${zkDevices.length} pointeuse(s) · ${zkDevices.filter(d => d.status === 'online').length} en ligne`} iconName="clock" accentColor={C.online} open={showPointeuses} onPress={() => setShowPointeuses(!showPointeuses)} />
        {showPointeuses && (
          <View style={s.expandedCard}>
            <View style={s.statsRow}>
              {[
                { label: 'En ligne',   val: zkDevices.filter(d => d.status === 'online').length,  color: C.online  },
                { label: 'Total',      val: zkDevices.length,                                      color: C.cyan    },
                { label: 'Hors ligne', val: zkDevices.filter(d => d.status === 'offline').length, color: C.offline },
              ].map(st => (
                <View key={st.label} style={[s.netStat, { borderLeftColor: st.color }]}>
                  <Text style={[s.netStatValue, { color: st.color }]}>{st.val}</Text>
                  <Text style={s.netStatLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: `${C.online}18`, borderColor: `${C.online}44` }]} onPress={() => setZkModalVisible(true)}>
              <Feather name="plus-circle" size={14} color={C.online} /><Text style={[s.addBtnText, { color: C.online }]}> Ajouter une pointeuse</Text>
            </TouchableOpacity>
            {zkDevices.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <MaterialCommunityIcons name="desktop-classic" size={32} color={C.textMuted} style={{ marginBottom: 8 }} />
                <Text style={s.equipType}>Aucune pointeuse configurée</Text>
              </View>
            ) : zkDevices.map((device, i) => {
              const dc = device.status === 'online' ? C.online : device.status === 'offline' ? C.offline : C.textMuted;
              return (
                <View key={device.id} style={[s.equipRow, i < zkDevices.length - 1 && s.rowBorder]}>
                  <View style={[s.equipIconBox, { backgroundColor: `${dc}18` }]}><MaterialCommunityIcons name="desktop-classic" size={20} color={dc} /></View>
                  <View style={s.equipInfo}>
                    <Text style={s.equipName}>{device.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Feather name="globe" size={10} color={C.textMuted} /><Text style={s.equipType}>{device.ip}:{device.port}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Feather name="clock" size={10} color={C.textMuted} /><Text style={s.equipType}>{formatSync(device.lastSync)}</Text>
                    </View>
                    {device.userCount !== undefined && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Feather name="users" size={10} color={C.textMuted} /><Text style={s.equipType}>{device.userCount} employés</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[s.equipBadge, { backgroundColor: `${dc}18` }]}>
                      <Text style={[s.equipStatus, { color: dc }]}>{device.status === 'online' ? 'En ligne' : device.status === 'offline' ? 'Hors ligne' : 'Inconnu'}</Text>
                    </View>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => handleDeleteDevice(device)}>
                      <Feather name="trash-2" size={14} color={C.offline} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Version */}
      <View style={s.versionCard}>
        <Feather name="smartphone" size={36} color={C.accentGlow} style={{ marginBottom: 10 }} />
        <Text style={s.versionTitle}>All In One — Plateforme IoT</Text>
        <Text style={s.versionText}>Version 1.0.0 · Expo SDK 54 · React Native 0.81</Text>
        <View style={[s.networkBadge, { backgroundColor: networkMode === 'tailscale' ? `${C.online}15` : `${C.warn}15` }]}>
          <Feather name={networkMode === 'tailscale' ? 'globe' : 'home'} size={12} color={networkMode === 'tailscale' ? C.online : C.warn} />
          <Text style={[s.networkBadgeText, { color: networkMode === 'tailscale' ? C.online : C.warn }]}>{networkMode === 'tailscale' ? ' Mode Tailscale' : ' Mode Local'}</Text>
        </View>
      </View>
      <View style={{ height: 30 }} />

      {/* MODAL USER DETAIL */}
      <Modal visible={userModalVisible} animationType="slide" transparent onRequestClose={() => setUserModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalCard, { borderTopColor: C.gold, transform: [{ translateY: swipeUser.translateY }] }]}>
            <View style={s.modalHandle} {...swipeUser.panResponder.panHandlers} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user" size={17} color={C.gold} />
                  <Text style={s.modalTitle}> Détails utilisateur</Text>
                </View>
                <TouchableOpacity onPress={() => setUserModalVisible(false)}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>
              {selectedUser && (
                <>
                  <View style={s.modalAvatarSection}>
                    <View style={[s.modalAvatar, { borderColor: ROLE_COLOR[selectedUser.role], backgroundColor: `${ROLE_COLOR[selectedUser.role]}22` }]}>
                      <Feather name={ROLE_ICON_NAME[selectedUser.role]} size={36} color={ROLE_COLOR[selectedUser.role]} />
                    </View>
                    <Text style={s.profilName}>{selectedUser.username}</Text>
                    <Text style={s.profilEmail}>{selectedUser.email}</Text>
                  </View>
                  <View style={s.readonlyCard}>
                    <View style={s.readonlyRow}>
                      <Text style={s.infoLabel}>UID</Text>
                      <Text style={[s.infoValue, { fontSize: 10, color: C.textMuted }]} numberOfLines={1}>{selectedUser.uid}</Text>
                    </View>
                    <View style={s.divider} />
                    <View style={s.readonlyRow}>
                      <Text style={s.infoLabel}>Rôle actuel</Text>
                      <Text style={[s.infoValue, { color: ROLE_COLOR[selectedUser.role] }]}>{ROLE_LABEL[selectedUser.role]}</Text>
                    </View>
                  </View>
                  {selectedUser.uid !== user?.uid ? (
                    <>
                      <Text style={s.formLabel}>Changer le rôle</Text>
                      <View style={s.typeRow}>
                        {(['admin', 'security', 'user'] as UserRole[]).map(r => (
                          <TouchableOpacity key={r} style={[s.typeBtn, editRole === r && { borderColor: ROLE_COLOR[r], backgroundColor: `${ROLE_COLOR[r]}22` }]} onPress={() => setEditRole(r)}>
                            <Feather name={ROLE_ICON_NAME[r]} size={20} color={editRole === r ? ROLE_COLOR[r] : C.textMuted} />
                            <Text style={[s.typeBtnText, editRole === r && { color: ROLE_COLOR[r], fontWeight: '700' }]}>{ROLE_LABEL[r]}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity style={[s.confirmBtn, { backgroundColor: C.gold }, savingRole && { opacity: 0.7 }]} onPress={handleSaveRole} disabled={savingRole}>
                        {savingRole ? <ActivityIndicator color="#fff" /> : <><Feather name="save" size={15} color="#fff" /><Text style={s.confirmBtnText}> Sauvegarder le rôle</Text></>}
                      </TouchableOpacity>

                      {/* ── Gestion des accès ── */}
                      <Text style={[s.formLabel, { marginTop: 18 }]}>🔐 Gestion des accès</Text>
                      <View style={[s.readonlyCard, { marginBottom: 8 }]}>
                        {([
                          { key: 'cameras',    label: 'Caméras',    icon: 'video'   },
                          { key: 'alerts',     label: 'Alertes',    icon: 'bell'    },
                          { key: 'iot',        label: 'IoT',        icon: 'cpu'     },
                          { key: 'access',     label: 'Accès',      icon: 'lock'    },
                          { key: 'lights',     label: 'Lumières',   icon: 'zap'     },
                          { key: 'attendance', label: 'Pointages',  icon: 'clock'   },
                        ] as { key: Permission; label: string; icon: string }[]).map((item: { key: Permission; label: string; icon: string }, i: number, arr: any[]) => {
                          const active = editPermissions.includes(item.key);
                          return (
                            <View key={String(item.key)}>
                              {i > 0 && <View style={s.divider} />}
                              <TouchableOpacity
                                style={[s.infoRow, { paddingVertical: 10 }]}
                                onPress={() => togglePermission(item.key)}
                                activeOpacity={0.7}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <View style={[s.equipIconBox, { width: 32, height: 32, borderRadius: 8, backgroundColor: active ? `${C.accentGlow}22` : `${C.border}44` }]}>
                                    <Feather name={item.icon as any} size={16} color={active ? C.accentGlow : C.textMuted} />
                                  </View>
                                  <Text style={[s.infoLabel, { color: active ? C.textPrimary : C.textMuted, fontWeight: active ? '700' : '400' }]}>
                                    {item.label}
                                  </Text>
                                </View>
                                <View style={[{
                                  width: 44, height: 24, borderRadius: 12,
                                  backgroundColor: active ? C.accentGlow : C.border,
                                  justifyContent: 'center',
                                  paddingHorizontal: 2,
                                }]}>
                                  <View style={{
                                    width: 20, height: 20, borderRadius: 10,
                                    backgroundColor: '#fff',
                                    alignSelf: active ? 'flex-end' : 'flex-start',
                                  }} />
                                </View>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        style={[s.confirmBtn, { backgroundColor: C.cyan }, savingPerms && { opacity: 0.7 }]}
                        onPress={handleSavePermissions}
                        disabled={savingPerms}
                      >
                        {savingPerms
                          ? <ActivityIndicator color="#fff" />
                          : <><Feather name="shield" size={15} color="#fff" /><Text style={s.confirmBtnText}> Sauvegarder les accès</Text></>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity style={s.deleteUserBtn} onPress={() => handleDeleteUser(selectedUser)} disabled={!!deletingUserId}>
                        {deletingUserId === selectedUser.uid ? <ActivityIndicator color={C.offline} /> : <><Feather name="trash-2" size={14} color={C.offline} /><Text style={s.deleteUserBtnText}> Supprimer ce compte</Text></>}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={s.infoBanner}>
                      <Feather name="info" size={12} color={C.gold} />
                      <Text style={[s.infoBannerText, { color: C.gold }]}> Il s'agit de votre propre compte.</Text>
                    </View>
                  )}
                </>
              )}
              <TouchableOpacity style={s.cancelBtn} onPress={() => setUserModalVisible(false)}><Text style={s.cancelBtnText}>Fermer</Text></TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* MODAL ADD USER */}
      <Modal visible={addUserModalVisible} animationType="slide" transparent onRequestClose={() => setAddUserModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalCard, { borderTopColor: C.gold, transform: [{ translateY: swipeAddUser.translateY }] }]}>
            <View style={s.modalHandle} {...swipeAddUser.panResponder.panHandlers} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user-plus" size={17} color={C.gold} />
                  <Text style={s.modalTitle}> Nouvel utilisateur</Text>
                </View>
                <TouchableOpacity onPress={() => { setAddUserModalVisible(false); resetAddUserForm(); }}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>
              {addUserError   ? <View style={s.errorBanner}><Text style={s.errorText}>{addUserError}</Text></View>   : null}
              {addUserSuccess ? <View style={s.successBanner}><Text style={s.successText}>{addUserSuccess}</Text></View> : null}
              <Text style={s.formLabel}>Nom d'utilisateur *</Text>
              <FInput value={addUsername} onChangeText={(t: string) => { setAddUsername(t); setAddUserError(''); }} placeholder="ex: john_doe" />
              <Text style={s.formLabel}>Email *</Text>
              <FInput value={addEmail} onChangeText={(t: string) => { setAddEmail(t); setAddUserError(''); }} placeholder="ex: john@example.com" kb="email-address" />
              <Text style={s.formLabel}>Mot de passe * (min. 6 car.)</Text>
              <FInput value={addPassword} onChangeText={(t: string) => { setAddPassword(t); setAddUserError(''); }} placeholder="••••••••" secure />
              <Text style={s.formLabel}>Téléphone (optionnel)</Text>
              <View style={s.phoneRow}>
                <View style={s.phonePrefix}><Text style={s.phonePrefixText}>+216</Text></View>
                <TextInput style={[s.formInput, { flex: 1 }]} value={addPhone} onChangeText={setAddPhone} placeholder="XX XXX XXX" placeholderTextColor={C.textMuted} keyboardType="phone-pad" />
              </View>
              <Text style={s.formLabel}>Rôle *</Text>
              <View style={s.typeRow}>
                {(['admin', 'security', 'user'] as UserRole[]).map(r => (
                  <TouchableOpacity key={r} style={[s.typeBtn, addRole === r && { borderColor: ROLE_COLOR[r], backgroundColor: `${ROLE_COLOR[r]}22` }]} onPress={() => setAddRole(r)}>
                    <Feather name={ROLE_ICON_NAME[r]} size={20} color={addRole === r ? ROLE_COLOR[r] : C.textMuted} />
                    <Text style={[s.typeBtnText, addRole === r && { color: ROLE_COLOR[r], fontWeight: '700' }]}>{ROLE_LABEL[r]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: C.gold }, addingUser && { opacity: 0.7 }]} onPress={handleAddUser} disabled={addingUser}>
                {addingUser ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={15} color="#fff" /><Text style={s.confirmBtnText}> Créer le compte</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setAddUserModalVisible(false); resetAddUserForm(); }}><Text style={s.cancelBtnText}>Annuler</Text></TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* MODAL EZVIZ */}
      <Modal visible={ezvizModalVisible} animationType="slide" transparent onRequestClose={() => setEzvizModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalCard, { transform: [{ translateY: swipeEzviz.translateY }] }]}>
            <View style={s.modalHandle} {...swipeEzviz.panResponder.panHandlers} />
            <View style={s.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="radio" size={17} color={C.cyan} />
                <Text style={s.modalTitle}> Ajouter un capteur EZVIZ</Text>
              </View>
              <TouchableOpacity onPress={() => { setEzvizModalVisible(false); resetEzvizForm(); }}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <View style={s.infoBanner}>
              <Feather name="server" size={12} color={C.online} />
              <Text style={s.infoBannerText}> Surveillance via Raspberry Pi ({RASPBERRY_IP})</Text>
            </View>
            <Text style={s.formLabel}>Serial du capteur *</Text>
            <FInput value={manualSerial} onChangeText={setManualSerial} placeholder="ex: Q19438827-Q19513185" />
            <Text style={s.formLabel}>Nom *</Text>
            <FInput value={manualName} onChangeText={setManualName} placeholder="ex: PIR Salon" cap="sentences" />
            <Text style={s.formLabel}>Type *</Text>
            <View style={s.typeRow}>
              {(['PIR','DOOR','BUTTON'] as const).map(t => {
                const ic = EZVIZ_ICON_MAP[t] || 'radio';
                const col = EZVIZ_COLORS[t] || C.cyan;
                return (
                  <TouchableOpacity key={t} style={[s.typeBtn, manualType === t && { borderColor: col, backgroundColor: `${col}22` }]} onPress={() => setManualType(t)}>
                    <Feather name={ic} size={20} color={manualType === t ? col : C.textMuted} />
                    <Text style={[s.typeBtnText, manualType === t && { color: col, fontWeight: '700' }]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={[s.confirmBtn, { backgroundColor: C.cyan }, addingEzviz && { opacity: 0.7 }]} onPress={() => addEzvizSensor(manualSerial.trim(), manualName.trim(), manualType)} disabled={addingEzviz}>
              {addingEzviz ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={15} color="#fff" /><Text style={s.confirmBtnText}> Activer la surveillance</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setEzvizModalVisible(false); resetEzvizForm(); }}><Text style={s.cancelBtnText}>Annuler</Text></TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* MODAL ZKTECO */}
      <Modal visible={zkModalVisible} animationType="slide" transparent onRequestClose={() => setZkModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalCard, { transform: [{ translateY: swipeZk.translateY }] }]}>
            <View style={s.modalHandle} {...swipeZk.panResponder.panHandlers} />
            <View style={s.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="desktop-classic" size={18} color={C.online} />
                <Text style={s.modalTitle}> Ajouter une pointeuse</Text>
              </View>
              <TouchableOpacity onPress={() => { setZkModalVisible(false); resetZkForm(); }}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
            </View>
            <View style={s.infoBanner}>
              <Feather name="server" size={12} color={C.online} />
              <Text style={s.infoBannerText}> Testée via Raspberry Pi ({RASPBERRY_IP})</Text>
            </View>
            {[
              { label: 'ID unique *',         ph: 'ex: K40_02',           val: zkId,   set: setZkId,   kb: 'default' as const },
              { label: 'Nom *',               ph: 'ex: Pointeuse Entrée', val: zkName, set: setZkName, kb: 'default' as const },
              { label: 'Adresse IP *',        ph: 'ex: 192.168.0.225',    val: zkIp,   set: setZkIp,   kb: 'numeric'  as const },
              { label: 'Port (défaut: 4370)', ph: '4370',                 val: zkPort, set: setZkPort, kb: 'numeric'  as const },
            ].map(f => (
              <View key={f.label}>
                <Text style={s.formLabel}>{f.label}</Text>
                <FInput value={f.val} onChangeText={f.set} placeholder={f.ph} kb={f.kb} />
              </View>
            ))}
            <TouchableOpacity style={[s.confirmBtn, { backgroundColor: C.online }, addingDevice && { opacity: 0.7 }]} onPress={handleAddDevice} disabled={addingDevice}>
              {addingDevice ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={15} color="#fff" /><Text style={s.confirmBtnText}> Connecter la pointeuse</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setZkModalVisible(false); resetZkForm(); }}><Text style={s.cancelBtnText}>Annuler</Text></TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* MODAL CAMERA */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalCard, { transform: [{ translateY: swipeCamera.translateY }] }]}>
            <View style={s.modalHandle} {...swipeCamera.panResponder.panHandlers} />
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="video" size={17} color={C.accentGlow} />
                  <Text style={s.modalTitle}> Ajouter une caméra</Text>
                </View>
                <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>
              <View style={s.infoBanner}>
                <Feather name="server" size={12} color={C.online} />
                <Text style={s.infoBannerText}> Firebase + MediaMTX via Raspberry ({RASPBERRY_IP})</Text>
              </View>
              <Text style={s.formLabel}>Type</Text>
              <View style={s.typeRow}>
                {([['ip','video','Caméra IP'],['dvr','server','DVR Hik'],['nvr','monitor','NVR Dahua']] as [string,string,string][]).map(([t,ic,lb]) => (
                  <TouchableOpacity key={t} style={[s.typeBtn, newType === t && { borderColor: C.accentGlow, backgroundColor: `${C.accent}22` }]}
                    onPress={() => {
                      setNewType(t as any); setNewPort('554'); setNewChannel('1');
                      if (t === 'nvr') { setNewIp('192.168.1.235'); setNewUser('admin'); setNewPass('admin1234'); }
                      else if (t === 'dvr') { setNewIp('192.168.1.15'); setNewUser('admin'); setNewPass('planet123'); }
                      else { setNewIp(''); setNewUser('admin'); setNewPass(''); }
                    }}>
                    <Feather name={ic as any} size={18} color={newType === t ? C.accentGlow : C.textMuted} />
                    <Text style={[s.typeBtnText, newType === t && { color: C.accentGlow, fontWeight: '700' }]}>{lb}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.formLabel}>Nom *</Text>
              <FInput value={newName} onChangeText={setNewName} placeholder="Ex: Caméra Entrée" />
              {newName.length > 0 && <Text style={s.streamPreview}>Stream : <Text style={{ color: C.online }}>{toStreamName(newName)}</Text></Text>}
              <Text style={s.formLabel}>Adresse IP *</Text>
              <FInput value={newIp} onChangeText={setNewIp} placeholder="192.168.1.100" kb="numeric" />
              <View style={s.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.formLabel}>Utilisateur</Text>
                  <FInput value={newUser} onChangeText={setNewUser} placeholder="admin" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.formLabel}>Mot de passe *</Text>
                  <FInput value={newPass} onChangeText={setNewPass} placeholder="••••••" secure />
                </View>
              </View>
              <View style={s.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.formLabel}>Port</Text>
                  <FInput value={newPort} onChangeText={setNewPort} placeholder="554" kb="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.formLabel}>{newType === 'dvr' || newType === 'nvr' ? 'Canal' : 'Chemin'}</Text>
                  <FInput value={newType === 'dvr' || newType === 'nvr' ? newChannel : newPath} onChangeText={newType === 'dvr' || newType === 'nvr' ? setNewChannel : setNewPath} placeholder={newType === 'dvr' || newType === 'nvr' ? '1' : 'h264_stream'} kb={newType === 'dvr' || newType === 'nvr' ? 'numeric' : 'default'} />
                </View>
              </View>
              <View style={s.uriPreview}>
                <Text style={s.uriPreviewLabel}>URI locale :</Text>
                <Text style={s.uriPreviewText} numberOfLines={2}>{newIp ? buildUri() : 'Remplissez les champs...'}</Text>
              </View>
              <TouchableOpacity style={[s.confirmBtn, addingCamera && { opacity: 0.7 }]} onPress={handleAddCamera} disabled={addingCamera}>
                {addingCamera ? <ActivityIndicator color="#fff" /> : <><Feather name="check" size={15} color="#fff" /><Text style={s.confirmBtnText}> Ajouter la caméra</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setModalVisible(false); resetForm(); }}><Text style={s.cancelBtnText}>Annuler</Text></TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* MODAL PROFIL */}
      <Modal visible={profilModalVisible} animationType="slide" transparent onRequestClose={() => setProfilModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalCard, { transform: [{ translateY: swipeProfil.translateY }] }]}>
            <View style={s.modalHandle} {...swipeProfil.panResponder.panHandlers} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="edit-2" size={17} color={C.accentGlow} />
                  <Text style={s.modalTitle}> Mon Profil</Text>
                </View>
                <TouchableOpacity onPress={() => setProfilModalVisible(false)}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>
              <View style={s.modalAvatarSection}>
                <View style={[s.modalAvatar, { borderColor: roleColor, backgroundColor: `${roleColor}22` }]}>
                  <Feather name={userRoleStr === 'admin' ? 'shield' : userRoleStr === 'security' ? 'lock' : 'user'} size={36} color={roleColor} />
                </View>
                <Text style={[s.profilName, { marginTop: 8 }]}>{user?.username}</Text>
                <Text style={[s.profilRole, { color: roleColor }]}>{roleLabel}</Text>
              </View>
              <View style={s.tabRow}>
                {([['info','Informations','user'],['password','Mot de passe','lock']] as const).map(([key, label, icon]) => (
                  <TouchableOpacity key={key} style={[s.tab, activeTab === key && s.tabActive]} onPress={() => setActiveTab(key as any)}>
                    <Feather name={icon} size={13} color={activeTab === key ? '#fff' : C.textMuted} />
                    <Text style={[s.tabText, activeTab === key && s.tabTextActive]}> {label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {activeTab === 'info' && (
                <>
                  <View style={s.readonlyCard}>
                    {[{ label: 'Email', value: user?.email, icon: 'mail' as const }, { label: 'Rôle', value: roleLabel, icon: 'shield' as const, color: roleColor }].map((row, i) => (
                      <View key={row.label}>
                        {i > 0 && <View style={s.divider} />}
                        <View style={s.readonlyRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Feather name={row.icon} size={13} color={C.textMuted} />
                            <Text style={s.infoLabel}>{row.label}</Text>
                          </View>
                          <Text style={[s.infoValue, (row as any).color ? { color: (row as any).color } : {}]}>{row.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={s.formLabel}>Nom d'utilisateur</Text>
                  <FInput value={editUsername} onChangeText={(t: string) => { setEditUsername(t); setProfileError(''); }} placeholder="Votre nom d'utilisateur" />
                  <Text style={s.formLabel}>Téléphone</Text>
                  <View style={s.phoneRow}>
                    <View style={s.phonePrefix}><Text style={s.phonePrefixText}>+216</Text></View>
                    <TextInput style={[s.formInput, { flex: 1 }]} value={editPhone.replace('+216', '').trim()} onChangeText={t => { setEditPhone(`+216${t}`); setProfileError(''); }} placeholder="XX XXX XXX" placeholderTextColor={C.textMuted} keyboardType="phone-pad" />
                  </View>
                  {profileError   ? <View style={s.errorBanner}><Text style={s.errorText}>{profileError}</Text></View>   : null}
                  {profileSuccess ? <View style={s.successBanner}><Text style={s.successText}>{profileSuccess}</Text></View> : null}
                  <TouchableOpacity style={[s.confirmBtn, profileLoading && { opacity: 0.7 }]} onPress={handleSaveProfile} disabled={profileLoading}>
                    {profileLoading ? <ActivityIndicator color="#fff" /> : <><Feather name="save" size={15} color="#fff" /><Text style={s.confirmBtnText}> Sauvegarder</Text></>}
                  </TouchableOpacity>
                </>
              )}
              {activeTab === 'password' && (
                <>
                  {passError   ? <View style={s.errorBanner}><Text style={s.errorText}>{passError}</Text></View>   : null}
                  {passSuccess ? <View style={s.successBanner}><Text style={s.successText}>{passSuccess}</Text></View> : null}
                  {[
                    { label: 'Mot de passe actuel',      val: editCurrentPass, set: setEditCurrentPass, show: showCurrentPass, toggle: setShowCurrentPass },
                    { label: 'Nouveau mot de passe',      val: editPass,        set: setEditPass,        show: showNewPass,     toggle: setShowNewPass     },
                    { label: 'Confirmer le mot de passe', val: editPassConfirm, set: setEditPassConfirm, show: showConfirmPass, toggle: setShowConfirmPass },
                  ].map((f, i) => (
                    <View key={i}>
                      <Text style={s.formLabel}>{f.label}</Text>
                      <View style={s.passRow}>
                        <TextInput style={[s.formInput, { flex: 1 }]} value={f.val} onChangeText={t => { f.set(t); setPassError(''); }} placeholder="••••••••" placeholderTextColor={C.textMuted} secureTextEntry={!f.show} />
                        <TouchableOpacity style={s.eyeBtn} onPress={() => f.toggle(!f.show)}>
                          <Feather name={f.show ? 'eye-off' : 'eye'} size={17} color={C.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  {editPass.length > 0 && (
                    <View style={s.strengthRow}>
                      {[1,2,3].map(i => <View key={i} style={[s.strengthBar, { backgroundColor: passStrength >= i ? passStrengthColor : C.border }]} />)}
                      <Text style={[s.strengthLabel, { color: passStrengthColor }]}>{passStrengthLabel}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={[s.confirmBtn, passLoading && { opacity: 0.7 }]} onPress={handleSavePassword} disabled={passLoading}>
                    {passLoading ? <ActivityIndicator color="#fff" /> : <><Feather name="lock" size={15} color="#fff" /><Text style={s.confirmBtnText}> Changer le mot de passe</Text></>}
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={s.cancelBtn} onPress={() => setProfilModalVisible(false)}><Text style={s.cancelBtnText}>Fermer</Text></TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// ─── Styles (C is passed in, no module-level reference) ──────────────────────
const makeStyles = (C: AppTheme) => StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },
  header:          { backgroundColor: C.surface, overflow: 'hidden' },
  headerAccentBar: { height: 3, backgroundColor: C.accentGlow },
  headerInner:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 44, paddingBottom: 14 },
  headerTitle:     { color: C.textPrimary, fontSize: 20, fontWeight: '700' },
  headerSub:       { color: C.textMuted, fontSize: 11, marginTop: 3 },
  iconBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,144,217,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderGlass },
  profilCard:      { margin: 12, backgroundColor: C.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, gap: 12 },
  avatarBox:       { width: 56, height: 56, borderRadius: 28, backgroundColor: C.surfaceAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  profilInfo:      { flex: 1 },
  profilName:      { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  profilRole:      { fontSize: 12, marginTop: 2, fontWeight: '600' },
  profilEmail:     { color: C.textMuted, fontSize: 11, marginTop: 2 },
  editProfilBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.accentGlow}15`, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.borderGlass },
  editProfilBtnText: { color: C.accentGlow, fontSize: 12, fontWeight: '700' },
  mainBtn:         { backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderLeftWidth: 3, borderWidth: 1, borderColor: C.border },
  mainBtnLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mainBtnIconBox:  { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  mainBtnTitle:    { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
  mainBtnSub:      { color: C.textMuted, fontSize: 11, marginTop: 2 },
  sectionBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  sectionBadgeText:{ fontSize: 10, fontWeight: '700' },
  togglePill:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  togglePillText:  { fontSize: 11, fontWeight: '700' },
  expandedCard:    { backgroundColor: C.surface2, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  infoLabel:       { color: C.textMuted, fontSize: 13 },
  infoValue:       { color: C.textPrimary, fontSize: 13, fontWeight: '700' },
  divider:         { height: 1, backgroundColor: C.border },
  editBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, borderRadius: 10, padding: 12, marginTop: 12 },
  editBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  modeBadge:       { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1 },
  modeBadgeText:   { fontSize: 12, fontWeight: '600' },
  addBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: `${C.accentGlow}15`, borderRadius: 10, padding: 12, marginBottom: 10, gap: 6, borderWidth: 1, borderColor: C.borderGlass },
  addBtnText:      { fontSize: 13, fontWeight: '700' },
  equipRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  rowBorder:       { borderBottomWidth: 1, borderBottomColor: C.border },
  equipIconBox:    { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  equipInfo:       { flex: 1 },
  equipName:       { color: C.textPrimary, fontSize: 13, fontWeight: '700' },
  equipType:       { color: C.textMuted, fontSize: 11, marginTop: 2 },
  equipBadge:      { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  equipStatus:     { fontSize: 10, fontWeight: '700' },
  camUri:          { color: C.border, fontSize: 10, marginTop: 2 },
  deleteBtn:       { padding: 7, backgroundColor: `${C.offline}15`, borderRadius: 8, borderWidth: 1, borderColor: `${C.offline}33` },
  userRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, gap: 10 },
  userAvatarBox:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  selfBadge:       { backgroundColor: `${C.gold}22`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: `${C.gold}44` },
  selfBadgeText:   { color: C.gold, fontSize: 9, fontWeight: '700' },
  deleteUserBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: `${C.offline}12`, borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: `${C.offline}33` },
  deleteUserBtnText: { color: C.offline, fontSize: 14, fontWeight: '700' },
  statsRow:        { flexDirection: 'row', gap: 8, marginBottom: 10 },
  netStat:         { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12, alignItems: 'center', borderLeftWidth: 3 },
  netStatValue:    { fontSize: 22, fontWeight: '700' },
  netStatLabel:    { color: C.textMuted, fontSize: 10, marginTop: 3 },
  eventRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  eventIconBox:    { width: 36, height: 36, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  eventInfo:       { flex: 1 },
  eventText:       { color: C.textPrimary, fontSize: 13 },
  eventTime:       { color: C.textMuted, fontSize: 10 },
  eventDot:        { width: 7, height: 7, borderRadius: 4 },
  versionCard:     { margin: 12, backgroundColor: C.surface, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  versionTitle:    { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  versionText:     { color: C.textMuted, fontSize: 11, marginTop: 4 },
  networkBadge:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 12 },
  networkBadgeText:{ fontSize: 12, fontWeight: '700' },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard:       { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '94%', borderTopWidth: 2, borderTopColor: C.accentGlow },
  modalHandle:     { width: 48, height: 6, backgroundColor: C.accentGlow, borderRadius: 3, alignSelf: 'center', marginBottom: 16, paddingVertical: 12, paddingHorizontal: 40 },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle:      { color: C.textPrimary, fontSize: 18, fontWeight: '700' },
  infoBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.online}10`, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: `${C.online}33` },
  infoBannerText:  { color: C.online, fontSize: 11, lineHeight: 16 },
  modalAvatarSection: { alignItems: 'center', marginBottom: 16 },
  modalAvatar:     { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 3 },
  tabRow:          { flexDirection: 'row', backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  tab:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 9, gap: 5 },
  tabActive:       { backgroundColor: C.accent },
  tabText:         { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextActive:   { color: '#fff' },
  readonlyCard:    { backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  readonlyRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  formLabel:       { color: C.accentGlow, fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  formInput:       { backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border, fontSize: 14, color: C.textPrimary },
  formRow:         { flexDirection: 'row', gap: 10 },
  streamPreview:   { color: C.textMuted, fontSize: 11, marginBottom: 4 },
  phoneRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phonePrefix:     { backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  phonePrefixText: { color: C.accentGlow, fontSize: 13, fontWeight: '700' },
  passRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:          { padding: 12, backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  strengthRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 4 },
  strengthBar:     { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:   { fontSize: 11, fontWeight: '700', minWidth: 60 },
  errorBanner:     { backgroundColor: `${C.offline}15`, borderRadius: 10, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: `${C.offline}33` },
  errorText:       { color: C.offline, fontSize: 13, textAlign: 'center' },
  successBanner:   { backgroundColor: `${C.online}15`, borderRadius: 10, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: `${C.online}33` },
  successText:     { color: C.online, fontSize: 13, textAlign: 'center', fontWeight: '700' },
  typeRow:         { flexDirection: 'row', gap: 10, marginBottom: 4 },
  typeBtn:         { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, gap: 6 },
  typeBtnText:     { color: C.textMuted, fontSize: 11 },
  uriPreview:      { backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border },
  uriPreviewLabel: { color: C.textMuted, fontSize: 11, marginBottom: 4 },
  uriPreviewText:  { color: C.online, fontSize: 11 },
  confirmBtn:      { backgroundColor: C.accent, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  confirmBtnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn:       { padding: 14, alignItems: 'center', marginTop: 4 },
  cancelBtnText:   { color: C.textMuted, fontSize: 14 },
});

export default ConfigScreen;