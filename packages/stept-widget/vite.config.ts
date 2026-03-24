import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SteptWidget',
      fileName: 'stept-widget',
      formats: ['iife'],  // Single file, no module system needed
    },
    outDir: 'dist',
    minify: true,
    rollupOptions: {
      output: {
        // No code splitting — everything in one file
        inlineDynamicImports: true,
      },
    },
  },
});
