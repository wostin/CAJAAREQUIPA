// vite.config.js — v7: proxy con fallback cuando backend no está corriendo
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = parseInt(env.VITE_API_URL?.split(':').pop() ?? '3000') || 3000;

  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          // Si el backend no está corriendo, devolver error 503 en vez de crashear Vite
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              console.warn('[Proxy] Backend no disponible:', err.message);
              if (res.writeHead) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  message: 'Backend no disponible. Inicia el servidor con: cd backend && npm run dev',
                  code: 'BACKEND_OFFLINE',
                }));
              }
            });
          },
        },
      },
    },
    // Preview (npm run preview)
    preview: {
      port: 4173,
    },
    // Reducir warnings en build
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
  };
});
