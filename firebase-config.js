import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    databaseURL: "https://slide-9c643-default-rtdb.asia-southeast1.firebasedatabase.app" // Use direct URL instead of env variable
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistence settings
export const db = initializeFirestore(app, {
    cache: {
        persistenceEnabled: true,
        cacheSizeBytes: 50000000
    },
    experimentalForceLongPolling: true
});

// Initialize Realtime Database - simplified config
export const realtimeDb = getDatabase(app);
