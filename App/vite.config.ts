import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// La App llama siempre a `/api/...` en su mismo origen. En local, Vite reenvía al Gateway sin el prefijo;
// en AWS lo va a hacer CloudFront. Mismo origen = sin CORS y con la cookie de sesión httpOnly sin vueltas.
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // Regex (empieza con ^) para que `/api-docs` o `/apiFoo` no se reenvíen por compartir el prefijo.
      '^/api/': {
        target: GATEWAY_URL,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/Setup.ts'],
    restoreMocks: true,
  },
});
