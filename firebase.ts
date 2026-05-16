import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCDPl-i-6I9-6-29YBFHN8U1VxImSR9B30",
  authDomain: "allinone-iot.firebaseapp.com",
  databaseURL: "https://allinone-iot-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "allinone-iot",
  storageBucket: "allinone-iot.firebasestorage.app",
  messagingSenderId: "882593005924",
  appId: "1:882593005924:web:e7defd7c9f85213fd53a71",
  measurementId: "G-LM5TXDGS0B"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);
export default app;