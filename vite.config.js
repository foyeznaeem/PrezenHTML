import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures assets are loaded relatively so they work in file:// protocols
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
