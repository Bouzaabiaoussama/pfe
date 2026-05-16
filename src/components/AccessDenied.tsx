import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
  feature?: string;
};

const AccessDenied = ({ feature }: Props) => {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: '#ff4444' }]}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Accès refusé</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {feature
            ? `Vous n'avez pas accès au module "${feature}".`
            : "Vous n'avez pas accès à cette fonctionnalité."}
        </Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Contactez votre administrateur pour obtenir les permissions nécessaires.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace('/dashboard')}>
          <Text style={styles.btnText}>⬅️ Retour au tableau de bord</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:      { borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 2, width: '100%', maxWidth: 360 },
  icon:      { fontSize: 64, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  subtitle:  { fontSize: 14, textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  hint:      { fontSize: 12, textAlign: 'center', marginBottom: 24, lineHeight: 18, fontStyle: 'italic' },
  btn:       { backgroundColor: '#7b2ff7', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24 },
  btnText:   { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});

export default AccessDenied;
