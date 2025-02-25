import { realtimeDb } from './firebase-config.js';
import { ref, onValue } from 'firebase/database';

export class FirebaseConnection {
    constructor() {
        this.connectionState = false;
        this.listeners = [];
        this.setupConnectionMonitoring();
    }

    setupConnectionMonitoring() {
        const connectedRef = ref(realtimeDb, '.info/connected');
        onValue(connectedRef, (snap) => {
            this.connectionState = snap.val() === true;
            this.notifyListeners();
        });
    }

    addConnectionListener(callback) {
        this.listeners.push(callback);
        // Immediately notify of current state
        callback(this.connectionState);
    }

    removeConnectionListener(callback) {
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this.connectionState));
    }

    isConnected() {
        return this.connectionState;
    }
}

// Create a singleton instance
export const firebaseConnection = new FirebaseConnection();
