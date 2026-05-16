import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CameraProvider } from './src/context/CameraContext';
import { DetectionProvider } from './src/context/DetectionContext';
import CameraScreen from './src/screens/CameraScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import LoginScreen from './src/screens/LoginScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#333',
          paddingBottom: 5,
          height: 60,
        },
        tabBarActiveTintColor: '#00d4ff',
        tabBarInactiveTintColor: '#888',
      }}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Cameras"
        component={CameraScreen}
        options={{
          tabBarLabel: 'Caméras',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>📹</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

import { Text } from 'react-native';

const AppNavigator = () => {
  const { user } = useAuth();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={TabNavigator} />
        
        
        
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <CameraProvider>
        <DetectionProvider>
          <AppNavigator />
        </DetectionProvider>
      </CameraProvider>
    </AuthProvider>
  );
};

export default App;