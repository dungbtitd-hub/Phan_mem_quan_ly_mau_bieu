import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi phát triển, chuyển /api và /health tới backend (cùng origin nên không cần CORS, cookie SameSite=Strict hoạt động).
const target = process.env.API_TARGET ?? 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target, changeOrigin: false }, '/health': { target, changeOrigin: false } }
  }
});
