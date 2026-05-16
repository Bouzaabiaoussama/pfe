import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CameraProvider } from '../src/context/CameraContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AlertsProvider } from '../src/context/AlertsContext';

function AppContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/dashboard');
    }
  }, [user, loading, segments]);

  return (
    <CameraProvider>
      <ThemeProvider>
        <AlertsProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AlertsProvider>
      </ThemeProvider>
    </CameraProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
