import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API_PROXY : viser une API lancée ailleurs (ex. sur le serveur, pour tester les vidéos avec QuickSync)
      '/api': { target: process.env.API_PROXY ?? 'http://localhost:3000', ws: true },
    },
  },
});
