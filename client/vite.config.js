import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Under udvikling sender Vite alle /api-kald videre til Express på port 3000.
    // Så ligger klient og API på samme adresse, og session-cookien virker uden CORS.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
