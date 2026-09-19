import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative assets keep the existing GitHub Pages subpath working while the
  // same dist/ can be served from Firebase Hosting at the production root.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      input: {
        main: 'index.html',
        clinic: 'clinic.html'
      }
    }
  }
});
