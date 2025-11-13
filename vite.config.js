import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, '.'),
  index: path.resolve(__dirname, 'index.html'),
  publicDir: 'public',
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
    },
    cors: true,
    watch: {
      ignored: ['**/server/**', '**/node_modules/**', '**/.git/**', '**/dist/**', '**/cache/**'],
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    reportCompressedSize: false,
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
  define: {
    __DEV__: JSON.stringify(true),
    __LOG_LEVEL__: JSON.stringify(import.meta.env.DEV ? 'debug' : 'info'),
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@chakra-ui/react',
      '@chakra-ui/hooks',
      '@chakra-ui/system',
      '@emotion/react',
      '@emotion/styled',
      'framer-motion',
    ],
  },
});
