import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve('./client'),
  resolve: {
    alias: {
      '@': path.resolve('./client/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    middlewareMode: true,
  },
  build: {
    outDir: path.resolve('./client/dist'),
    sourcemap: false,
    emptyOutDir: true,
  },
});
