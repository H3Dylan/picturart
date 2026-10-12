import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  define: {
    // Un identifiant par build : le service worker change, donc se met à jour, à chaque déploiement
    __BUILD_ID__: JSON.stringify(process.env.APP_VERSION ?? String(Date.now())),
  },
  build: {
    rolldownOptions: {
      // Le service worker est une entrée à part, servie à la racine sous un nom fixe
      input: { index: 'index.html', sw: 'src/sw.ts' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // API_PROXY : viser une API lancée ailleurs (ex. sur le serveur, pour tester les vidéos avec QuickSync)
      '/api': { target: process.env.API_PROXY ?? 'http://localhost:3000', ws: true },
    },
  },
});
