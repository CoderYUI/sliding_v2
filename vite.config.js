import firebase from 'firebase/compat/app';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/', // Updated for Cloudflare compatibility
  server: {
    port: 3000,
    host: '0.0.0.0', // Allow external access
    cors: true // Enable CORS for mobile access
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html',
        registration: 'registration.html', // Add this line
        admin: 'admin.html',
        lobby: 'lobby.html',
        puzzle1: 'puzzle1.html',
        puzzle2: 'puzzle2.html',
        puzzle3: 'puzzle3.html',
        puzzle4: 'puzzle4.html',
        puzzle5: 'puzzle5.html',
        puzzle6: 'puzzle6.html',
        puzzle7: 'puzzle7.html',
        puzzle8: 'puzzle8.html',
        puzzle9: 'puzzle9.html',
        puzzle10: 'puzzle10.html',
        puzzle11: 'puzzle11.html',
        puzzle12: 'puzzle12.html',
        waiting: 'waiting.html',
        waiting_leaderboard: 'waiting_leaderboard.html',
        thankyou: 'thankyou.html',
        leaderboard: 'leaderboard.html'
      },
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/database']
        }
      }
    },
    copyPublicDir: true,
    chunkSizeWarningLimit: 600,
    target: 'esnext' // Optimized for modern browsers
  },
  publicDir: 'public'
});