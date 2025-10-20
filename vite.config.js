import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // resolve/alias deve ficar no topo-level, não dentro de server
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3000,
      timeout: 120000,
    },
  },
  worker: {
    // Configure Web Worker handling
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
    __LOG_LEVEL__: JSON.stringify(import.meta.env.DEV ? 'debug' : 'info'),
  },
});