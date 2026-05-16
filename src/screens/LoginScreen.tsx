import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';


type ForgotMethod = 'email' | 'phone';


export default function LoginScreen() {
  const C = useTheme();
  const s = makeStyles(C);
  const [username, setUsername]               = useState('');
  const [password, setPassword]               = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [usernameError, setUsernameError]     = useState('');
  const [passwordError, setPasswordError]     = useState('');
  const [loginError, setLoginError]           = useState('');
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const [showForgot, setShowForgot]           = useState(false);
  const [forgotMethod, setForgotMethod]       = useState<ForgotMethod>('email');
  const [forgotEmail, setForgotEmail]         = useState('');
  const [forgotPhone, setForgotPhone]         = useState('');
  const [forgotLoading, setForgotLoading]     = useState(false);
  const [forgotSent, setForgotSent]           = useState(false);
  const [forgotError, setForgotError]         = useState('');
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState('');
  const [forgotEmailFocused, setForgotEmailFocused] = useState(false);
  const [forgotPhoneFocused, setForgotPhoneFocused] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;
  const btnScale  = useRef(new Animated.Value(1)).current;

  const { login, resetPasswordByEmail, resetPasswordByPhone, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 550, useNativeDriver: true }),
    ]).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const pressIn  = () => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true }).start();

  const validateLogin = () => {
    let valid = true;
    setUsernameError(''); setPasswordError(''); setLoginError('');
    if (!username) { setUsernameError("Nom d'utilisateur requis"); valid = false; }
    if (!password) { setPasswordError('Mot de passe requis'); valid = false; }
    return valid;
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!validateLogin()) { shake(); return; }
    const success = await login(username, password);
    if (success) {
      router.replace('/dashboard');
    } else {
      setLoginError("Identifiants incorrects. Vérifiez vos informations.");
      shake();
    }
  };

  const handleForgotPassword = async () => {
    setForgotError(''); setForgotSuccessMsg('');
    if (forgotMethod === 'email') {
      if (!forgotEmail) { setForgotError('Entrez votre adresse Gmail.'); return; }
      if (!forgotEmail.toLowerCase().endsWith('@gmail.com')) {
        setForgotError('Entrez une adresse Gmail valide.'); return;
      }
      setForgotLoading(true);
      const result = await resetPasswordByEmail(forgotEmail);
      setForgotLoading(false);
      if (result.success) {
        setForgotSent(true);
        setForgotSuccessMsg(`Lien envoyé sur ${forgotEmail}\nVérifiez votre boîte Gmail et les spams.`);
      } else {
        setForgotError(result.error || "Erreur lors de l'envoi.");
      }
    } else {
      if (!forgotPhone || forgotPhone.length < 8) {
        setForgotError('Entrez un numéro valide.'); return;
      }
      setForgotLoading(true);
      const result = await resetPasswordByPhone(`+216${forgotPhone}`);
      setForgotLoading(false);
      if (result.success) {
        setForgotSent(true);
        setForgotSuccessMsg(`Lien envoyé sur ${result.error || 'votre Gmail'}\nVérifiez votre boîte Gmail et les spams.`);
      } else {
        setForgotError(result.error || "Erreur lors de l'envoi.");
      }
    }
  };

  const resetForgot = () => {
    setShowForgot(false); setForgotSent(false);
    setForgotEmail(''); setForgotPhone('');
    setForgotError(''); setForgotSuccessMsg('');
    setForgotMethod('email');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={s.container}>

        {/* Decorative bg circles */}
        <View style={s.bgCircle1} />
        <View style={s.bgCircle2} />

        {/* Single page — KeyboardAvoidingView centres the content */}
        <KeyboardAvoidingView
          style={s.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Animated.View style={[s.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* Header */}
            <View style={s.header}>
              <View style={s.logoMark}>
                <View style={s.logoRing} />
                <View style={s.logoDot} />
              </View>
              <Text style={s.appName}>All In One</Text>
              <Text style={s.tagline}>PLATEFORME IoT INTELLIGENTE</Text>
            </View>

            {/* Card */}
            <Animated.View style={[s.card, { transform: [{ translateX: shakeAnim }] }]}>
              <Text style={s.cardTitle}>Connexion</Text>
              

              {loginError ? (
                <View style={s.errorBanner}>
                  <Text style={s.errorBannerText}>{loginError}</Text>
                </View>
              ) : null}

              {/* Username */}
              <View style={s.fieldWrap}>
                <Text style={[s.label, usernameFocused && s.labelFocused]}>NOM D'UTILISATEUR</Text>
                <TextInput
                  style={[s.input, usernameFocused && s.inputFocused, usernameError && s.inputErr]}
                  placeholder="Entrez votre nom d'utilisateur"
                  placeholderTextColor={C.textMuted}
                  value={username}
                  onChangeText={(t) => { setUsername(t); setUsernameError(''); }}
                  onFocus={() => setUsernameFocused(true)}
                  onBlur={() => setUsernameFocused(false)}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
                {usernameError ? <Text style={s.errText}>{usernameError}</Text> : null}
              </View>

              {/* Password */}
              <View style={s.fieldWrap}>
                <Text style={[s.label, passwordFocused && s.labelFocused]}>MOT DE PASSE</Text>
                <View style={[s.inputRow, passwordFocused && s.inputFocused, passwordError && s.inputErr]}>
                  <TextInput
                    style={s.inputInner}
                    placeholder="••••••••••"
                    placeholderTextColor={C.textMuted}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.revealBtn}>
                    <Text style={s.revealText}>{showPassword ? 'Masquer' : 'Afficher'}</Text>
                  </TouchableOpacity>
                </View>
                {passwordError ? <Text style={s.errText}>{passwordError}</Text> : null}
              </View>

              {/* Forgot */}
              <TouchableOpacity onPress={() => setShowForgot(true)} style={s.forgotWrap}>
                <Text style={s.forgotText}>Mot de passe oublié ?</Text>
              </TouchableOpacity>

              {/* CTA button */}
              <Animated.View style={[s.btnWrap, { transform: [{ scale: btnScale }] }]}>
                <TouchableOpacity
                  onPress={handleLogin}
                  onPressIn={pressIn}
                  onPressOut={pressOut}
                  disabled={loading}
                  activeOpacity={0.92}
                >
                  <View style={[s.loginBtn, loading && s.loginBtnDisabled]}>
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Text style={s.loginBtnText}>Se connecter</Text>
                        <View style={s.btnArrowBox}>
                          <Text style={s.btnArrowIcon}>›</Text>
                        </View>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>

            <Text style={s.version}>v1.0.0 · All In One IoT</Text>
          </Animated.View>
        </KeyboardAvoidingView>

        {/* ── Modal mot de passe oublié ── */}
        <Modal visible={showForgot} animationType="slide" transparent onRequestClose={resetForgot}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={s.overlay}>
              <TouchableWithoutFeedback>
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  style={{ width: '100%' }}
                >
                  <View style={s.sheet}>
                    <View style={s.handle} />
                    <View style={s.sheetHeader}>
                      <Text style={s.sheetTitle}>Récupérer le mot de passe</Text>
                      <TouchableOpacity onPress={resetForgot}>
                        <Text style={s.closeText}>Fermer</Text>
                      </TouchableOpacity>
                    </View>

                    {forgotSent ? (
                      <View style={s.successBox}>
                        <View style={s.successCircle} />
                        <Text style={s.successTitle}>Lien envoyé !</Text>
                        <Text style={s.successMsg}>{forgotSuccessMsg}</Text>
                        <TouchableOpacity style={s.loginBtn} onPress={resetForgot}>
                          <Text style={s.loginBtnText}>Fermer</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        <Text style={s.sheetDesc}>Choisissez la méthode de récupération de votre compte.</Text>

                        <View style={s.segment}>
                          <TouchableOpacity
                            style={[s.segBtn, forgotMethod === 'email' && s.segBtnActive]}
                            onPress={() => { setForgotMethod('email'); setForgotError(''); }}>
                            <Text style={[s.segText, forgotMethod === 'email' && s.segTextActive]}>Gmail</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.segBtn, forgotMethod === 'phone' && s.segBtnActive]}
                            onPress={() => { setForgotMethod('phone'); setForgotError(''); }}>
                            <Text style={[s.segText, forgotMethod === 'phone' && s.segTextActive]}>Téléphone</Text>
                          </TouchableOpacity>
                        </View>

                        {forgotError ? (
                          <View style={s.errorBanner}>
                            <Text style={s.errorBannerText}>{forgotError}</Text>
                          </View>
                        ) : null}

                        {forgotMethod === 'email' ? (
                          <View style={s.fieldWrap}>
                            <Text style={[s.label, forgotEmailFocused && s.labelFocused]}>ADRESSE GMAIL</Text>
                            <TextInput
                              style={[s.input, forgotEmailFocused && s.inputFocused]}
                              placeholder="votre@gmail.com"
                              placeholderTextColor={C.textMuted}
                              value={forgotEmail}
                              onChangeText={(t) => { setForgotEmail(t); setForgotError(''); }}
                              onFocus={() => setForgotEmailFocused(true)}
                              onBlur={() => setForgotEmailFocused(false)}
                              keyboardType="email-address"
                              autoCapitalize="none"
                            />
                            <Text style={s.hint}>Un lien de réinitialisation sera envoyé à cette adresse.</Text>
                          </View>
                        ) : (
                          <View style={s.fieldWrap}>
                            <Text style={[s.label, forgotPhoneFocused && s.labelFocused]}>NUMÉRO DE TÉLÉPHONE</Text>
                            <View style={[s.inputRow, forgotPhoneFocused && s.inputFocused]}>
                              <View style={s.prefix}>
                                <Text style={s.prefixText}>+216</Text>
                              </View>
                              <View style={s.divider} />
                              <TextInput
                                style={s.inputInner}
                                placeholder="XX XXX XXX"
                                placeholderTextColor={C.textMuted}
                                value={forgotPhone}
                                onChangeText={(t) => { setForgotPhone(t); setForgotError(''); }}
                                onFocus={() => setForgotPhoneFocused(true)}
                                onBlur={() => setForgotPhoneFocused(false)}
                                keyboardType="phone-pad"
                              />
                            </View>
                            <Text style={s.hint}>Le lien sera envoyé sur le Gmail associé à ce numéro.</Text>
                          </View>
                        )}

                        <TouchableOpacity
                          style={[s.loginBtn, forgotLoading && s.loginBtnDisabled]}
                          onPress={handleForgotPassword}
                          disabled={forgotLoading}
                          activeOpacity={0.88}
                        >
                          {forgotLoading ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={s.loginBtnText}>Envoyer le lien</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                    <View style={{ height: 32 }} />
                  </View>
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  bgCircle1: {
    position: 'absolute', top: -130, right: -90,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: C.accent, opacity: 0.08,
  },
  bgCircle2: {
    position: 'absolute', bottom: 60, left: -100,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: C.accentGlow, opacity: 0.06,
  },

  // KeyboardAvoidingView : centre verticalement tout le contenu
  kav:   { flex: 1, justifyContent: 'center' },
  inner: { paddingHorizontal: 24, width: '100%' },

  // Header
  header:  { alignItems: 'center', marginBottom: 28 },
  logoMark: {
    width: 54, height: 54, borderRadius: 15,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
    shadowColor: C.accent, shadowOpacity: 0.45,
    shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  logoRing: {
    position: 'absolute', width: 30, height: 30, borderRadius: 15,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)',
  },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  appName: {
    fontSize: 28, fontWeight: '700', color: C.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tagline: { fontSize: 10, color: C.textMuted, marginTop: 5, letterSpacing: 2.5 },

  // Card
  card: {
    backgroundColor: C.surface, borderRadius: 24, padding: 24,
    shadowColor: C.accent, shadowOpacity: 0.12,
    shadowRadius: 28, shadowOffset: { width: 0, height: 10 },
    elevation: 10, borderWidth: 1, borderColor: C.border,
  },
  cardTitle: {
    fontSize: 22, fontWeight: '700', color: C.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', marginBottom: 3,
    textAlign: 'center',
  },
  cardSub: { fontSize: 13, color: C.textMuted, marginBottom: 18 },

  errorBanner: {
    backgroundColor: C.errorBg, borderRadius: 10, padding: 11, marginBottom: 14,
    borderWidth: 1, borderColor: C.errorBorder,
    borderLeftWidth: 3, borderLeftColor: C.error,
  },
  errorBannerText: { color: C.error, fontSize: 13, lineHeight: 19 },

  // Fields
  fieldWrap:    { marginBottom: 2 },
  label:        { fontSize: 10, fontWeight: '700', color: C.textMuted, marginBottom: 7, marginTop: 14, letterSpacing: 1.5 },
  labelFocused: { color: C.accent },
  input: {
    backgroundColor: C.surfaceAlt, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 16,
    color: C.textPrimary, fontSize: 15,
    borderWidth: 1.5, borderColor: C.border,
  },
  inputFocused: { borderColor: C.borderFocus, backgroundColor: C.surfaceAlt },
  inputErr:     { borderColor: C.error },
  errText:      { color: C.error, fontSize: 12, marginTop: 5, marginLeft: 2 },
  hint:         { color: C.textMuted, fontSize: 11, marginTop: 6, marginLeft: 2, lineHeight: 16 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceAlt, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, overflow: 'hidden',
  },
  inputInner: { flex: 1, paddingVertical: 13, paddingHorizontal: 16, color: C.textPrimary, fontSize: 15 },
  revealBtn:  { paddingHorizontal: 16 },
  revealText: { color: C.accent, fontSize: 13, fontWeight: '600' },
  prefix:     { paddingHorizontal: 14, paddingVertical: 13 },
  prefixText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  divider:    { width: 1, height: 24, backgroundColor: C.border },

  forgotWrap: { alignSelf: 'flex-end', marginTop: 10 },
  forgotText: { color: C.accent, fontSize: 13, fontWeight: '600' },

  // Button
  btnWrap: { marginTop: 24 },
  loginBtn: {
    borderRadius: 16,
    paddingVertical: 17,
    paddingHorizontal: 28,
    backgroundColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: C.accent,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
  loginBtnDisabled: { opacity: 0.55 },
  btnShine: {},
  btnInner: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 12,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  btnArrowBox: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  btnArrowIcon: {
    color: '#fff', fontSize: 20, fontWeight: '900',
    lineHeight: 24, includeFontPadding: false,
  },
  btnContent:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  btnArrow:     { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  btnArrowText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  version: { color: C.textMuted, fontSize: 11, textAlign: 'center', marginTop: 20 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12,
    borderTopWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, elevation: 20,
  },
  handle:      { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: C.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  closeText:   { color: C.accent, fontSize: 14, fontWeight: '600' },
  sheetDesc:   { color: C.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 4 },

  segment:       { flexDirection: 'row', backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 4, marginVertical: 14, borderWidth: 1, borderColor: C.border },
  segBtn:        { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segBtnActive:  { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  segText:       { color: C.textMuted, fontSize: 14, fontWeight: '600' },
  segTextActive: { color: C.accent, fontWeight: '700' },

  successBox:    { alignItems: 'center', paddingVertical: 24 },
  successCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.successBg, borderWidth: 2, borderColor: C.successBorder, marginBottom: 16 },
  successTitle:  { fontSize: 20, fontWeight: '700', color: C.success, marginBottom: 10, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  successMsg:    { color: C.textSecond, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 16, paddingHorizontal: 12 },
});