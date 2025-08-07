import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import virtual from 'vite-plugin-virtual';

export default defineConfig({
  plugins: [virtual({ "prom-client":"export default {}", "winston":"export default {}" }), react(), visualizer({filename:"stats.html", gzipSize:true})],
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: { 
      input: path.resolve(import.meta.dirname, 'client/index.html'),
      output: {
        manualChunks: {
          'vendor-core': ['react','react-dom','zustand'],
        },
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client/src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@assets': path.resolve(import.meta.dirname, 'assets'),
    },
  },
});
