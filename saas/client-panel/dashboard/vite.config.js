import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O Express (api/server.js) serve o build em /app e a API na raiz.
const API = process.env.NAMY_API || 'http://127.0.0.1:3847';
const proxied = ['/auth', '/me', '/config', '/dashboard', '/whatsapp', '/logs', '/subscription', '/billing'];

export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: Object.fromEntries(proxied.map((p) => [p, { target: API, changeOrigin: true }])),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/recharts|d3-|victory|lodash/.test(id)) return 'charts';
          if (/react|scheduler/.test(id)) return 'react';
        },
      },
    },
  },
});
