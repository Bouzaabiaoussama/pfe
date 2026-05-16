import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword as firebaseUpdatePassword,
  User,
} from 'firebase/auth';
import { get, ref, set, update } from 'firebase/database';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, database } from '../config/firebase';

type UserRole = 'admin' | 'security' | 'user';

export type Permission = 'cameras' | 'alerts' | 'iot' | 'access' | 'lights' | 'attendance' | 'pointeuses';
// Backward compat alias
export type UserPermissions = Permission;

// Default permissions per role
export const DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:    ['cameras', 'alerts', 'iot', 'access', 'lights', 'attendance', 'pointeuses'],
  security: ['cameras', 'alerts', 'access'],
  user:     ['cameras'],
};

type AuthUser = {
  uid: string;
  email: string;
  username: string;
  role: UserRole;
  phone?: string;
  permissions?: Permission[];
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (
    username: string,
    email: string,
    password: string,
    role: UserRole,
    phone?: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: {
    username?: string;
    phone?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  resetPasswordByEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordByPhone: (phone: string) => Promise<{ success: boolean; error?: string }>;
  darkMode: boolean;
  toggleDarkMode: () => void;
  hasPermission: (feature: Permission) => boolean;
  updatePermissions: (uid: string, permissions: Permission[]) => Promise<{ success: boolean; error?: string }>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  login: async () => false,
  logout: () => {},
  register: async () => ({ success: false }),
  updateProfile: async () => ({ success: false }),
  changePassword: async () => ({ success: false }),
  resetPasswordByEmail: async () => ({ success: false }),
  resetPasswordByPhone: async () => ({ success: false }),
  darkMode: false,
  toggleDarkMode: () => {},
  hasPermission: () => false,
  updatePermissions: async () => ({ success: false }),
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        try {
          const snapshot = await get(ref(database, `users/${firebaseUser.uid}`));
          if (snapshot.exists()) {
            const d = snapshot.val();
            const role: UserRole = d.role;
            const perms: Permission[] = d.permissions ?? DEFAULT_PERMISSIONS[role];
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              username: d.username,
              role,
              phone: d.phone || '',
              permissions: perms,
            });
          }
        } catch (e) {
          console.error('Erreur récupération user:', e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      let email = username;
      if (!username.includes('@')) {
        const snap = await get(ref(database, `usernames/${username}`));
        if (!snap.exists()) { setLoading(false); return false; }
        email = snap.val();
      }
      await signInWithEmailAndPassword(auth, email, password);
      setLoading(false);
      return true;
    } catch (e) {
      setLoading(false);
      return false;
    }
  };

  const register = async (
    username: string,
    email: string,
    password: string,
    role: UserRole,
    phone?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const usernameSnap = await get(ref(database, `usernames/${username}`));
      if (usernameSnap.exists())
        return { success: false, error: "Nom d'utilisateur déjà utilisé" };
      if (phone) {
        const phoneSnap = await get(ref(database, `phones/${phone}`));
        if (phoneSnap.exists())
          return { success: false, error: 'Numéro de téléphone déjà utilisé' };
      }
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      await set(ref(database, `users/${uid}`), {
        uid, username, email, role,
        phone: phone || '',
        createdAt: new Date().toISOString(),
      });
      await set(ref(database, `usernames/${username}`), email);
      if (phone) await set(ref(database, `phones/${phone}`), uid);
      return { success: true };
    } catch (error: any) {
      let message = 'Erreur lors de la création du compte';
      if (error.code === 'auth/email-already-in-use') message = 'Email déjà utilisé';
      if (error.code === 'auth/weak-password') message = 'Mot de passe trop faible (min 6 caractères)';
      if (error.code === 'auth/invalid-email') message = 'Email invalide';
      return { success: false, error: message };
    }
  };

  // ✅ Modifier username et/ou téléphone
  const updateProfile = async (data: {
    username?: string;
    phone?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) return { success: false, error: 'Utilisateur non connecté.' };

      const updates: Record<string, any> = {};

      if (data.username && data.username !== user.username) {
        const snap = await get(ref(database, `usernames/${data.username}`));
        if (snap.exists())
          return { success: false, error: "Nom d'utilisateur déjà pris." };
        await set(ref(database, `usernames/${user.username}`), null);
        await set(ref(database, `usernames/${data.username}`), user.email);
        updates.username = data.username;
      }

      if (data.phone !== undefined && data.phone !== user.phone) {
        if (data.phone) {
          const snap = await get(ref(database, `phones/${data.phone}`));
          if (snap.exists())
            return { success: false, error: 'Numéro déjà utilisé par un autre compte.' };
          if (user.phone) await set(ref(database, `phones/${user.phone}`), null);
          await set(ref(database, `phones/${data.phone}`), user.uid);
        }
        updates.phone = data.phone;
      }

      if (Object.keys(updates).length > 0) {
        await update(ref(database, `users/${user.uid}`), updates);
        setUser(prev => prev ? { ...prev, ...updates } : prev);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Erreur lors de la mise à jour.' };
    }
  };

  // ✅ Changement de mot de passe avec ré-authentification Firebase
  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email)
        return { success: false, error: 'Utilisateur non connecté.' };
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await firebaseUpdatePassword(firebaseUser, newPassword);
      return { success: true };
    } catch (error: any) {
      let message = 'Erreur lors du changement de mot de passe';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential')
        message = 'Mot de passe actuel incorrect';
      if (error.code === 'auth/weak-password')
        message = 'Nouveau mot de passe trop faible (min 6 caractères)';
      if (error.code === 'auth/too-many-requests')
        message = 'Trop de tentatives. Réessayez plus tard.';
      if (error.code === 'auth/requires-recent-login')
        message = 'Session expirée. Déconnectez-vous et reconnectez-vous.';
      return { success: false, error: message };
    }
  };

  const resetPasswordByEmail = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const usersSnap = await get(ref(database, 'users'));
      let emailExists = false;
      if (usersSnap.exists()) {
        emailExists = Object.values(usersSnap.val()).some(
          (u: any) => u.email?.toLowerCase() === email.toLowerCase()
        );
      }
      if (!emailExists)
        return { success: false, error: 'Aucun compte trouvé avec cet email.' };
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error: any) {
      let message = "Erreur lors de l'envoi du lien";
      if (error.code === 'auth/user-not-found') message = 'Aucun compte avec cet email';
      if (error.code === 'auth/invalid-email') message = 'Email invalide';
      if (error.code === 'auth/too-many-requests') message = 'Trop de tentatives. Réessayez plus tard.';
      return { success: false, error: message };
    }
  };

  const resetPasswordByPhone = async (
    phone: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const phoneSnap = await get(ref(database, `phones/${phone}`));
      if (!phoneSnap.exists())
        return { success: false, error: 'Aucun compte trouvé avec ce numéro.' };
      const uid = phoneSnap.val();
      const userSnap = await get(ref(database, `users/${uid}`));
      if (!userSnap.exists()) return { success: false, error: 'Compte introuvable.' };
      const email: string = userSnap.val().email;
      if (!email) return { success: false, error: 'Aucun email associé à ce numéro.' };
      await sendPasswordResetEmail(auth, email);
      const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
      return { success: true, error: maskedEmail };
    } catch (error: any) {
      return { success: false, error: "Erreur lors de l'envoi." };
    }
  };

  const hasPermission = (feature: Permission): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true; // admin a toujours tout
    return (user.permissions ?? DEFAULT_PERMISSIONS[user.role]).includes(feature);
  };

  const updatePermissions = async (uid: string, permissions: Permission[]): Promise<{ success: boolean; error?: string }> => {
    try {
      await update(ref(database, `users/${uid}`), { permissions });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const logout = async () => {
    try { await signOut(auth); } catch (e) {}
    setUser(null);
  };

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, register,
      updateProfile,
      changePassword,
      resetPasswordByEmail, resetPasswordByPhone,
      darkMode, toggleDarkMode,
      hasPermission, updatePermissions,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);