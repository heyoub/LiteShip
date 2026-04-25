import { defineConfig } from 'vite';
import { plugin } from '@czap/vite';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [plugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: import.meta.dirname + '/index.html',
    },
  },
  logLevel: 'warn',
});
