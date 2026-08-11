import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webPort = Number(process.env.WEB_PORT ?? 5173);
const serverPort = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      '/rooms': {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/health': { target: `http://127.0.0.1:${serverPort}` },
      '/dev': { target: `http://127.0.0.1:${serverPort}` },
    },
  },
});
