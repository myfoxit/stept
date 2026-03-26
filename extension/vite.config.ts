import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, renameSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { build as esbuild } from 'esbuild';

// Manual multi-entry config for Chrome Extension MV3
// Each entry becomes a separate bundle
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'copy-extension-assets',
      async closeBundle() {
        // Copy manifest
        copyFileSync('manifest.json', 'dist/manifest.json');
        // Copy vendor
        mkdirSync('dist/vendor', { recursive: true });
        copyFileSync('src/vendor/rrweb-snapshot.min.js', 'dist/vendor/rrweb-snapshot.min.js');
        // Copy icons
        mkdirSync('dist/icons', { recursive: true });
        for (const size of ['16', '32', '48', '128']) {
          const src = `public/icons/icon${size}.png`;
          if (existsSync(src)) copyFileSync(src, `dist/icons/icon${size}.png`);
        }
        // Move HTML files from dist/public/ to dist/ root and fix asset paths
        for (const file of ['sidepanel.html', 'popup.html']) {
          const from = `dist/public/${file}`;
          const to = `dist/${file}`;
          if (existsSync(from)) {
            // Fix relative paths: ../assets/ → ./assets/ since we move up one level
            let html = readFileSync(from, 'utf-8');
            html = html.replace(/\.\.\/assets\//g, './assets/');
            writeFileSync(to, html);
          }
        }
        // Clean up empty public dir
        if (existsSync('dist/public')) rmSync('dist/public', { recursive: true });

        // Build guide-runtime separately with esbuild — it needs React
        // inlined as a single IIFE file (content scripts can't import modules)
        await esbuild({
          entryPoints: [resolve(__dirname, 'src/guide-runtime/index.ts')],
          bundle: true,
          format: 'iife',
          outfile: 'dist/guide-runtime.js',
          minify: true,
          jsx: 'automatic',
          jsxImportSource: 'react',
          tsconfig: resolve(__dirname, 'tsconfig.json'),
          alias: {
            '@': resolve(__dirname, 'src'),
          },
          define: {
            'process.env.NODE_ENV': '"production"',
          },
        });
      },
    },
  ],
  // Use relative paths for Chrome extension compatibility
  base: './',
  // Disable default public dir copying (we handle it manually)
  publicDir: false,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    'import.meta.env.BUILD_MODE': JSON.stringify(mode === 'cloud' ? 'cloud' : 'self-hosted'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode === 'development' ? false : 'esbuild',
    rollupOptions: {
      input: {
        // Service worker
        'background': resolve(__dirname, 'src/background/index.ts'),
        // Content scripts (no React — vanilla TS)
        'content': resolve(__dirname, 'src/content/index.ts'),
        'redaction': resolve(__dirname, 'src/content/redaction.ts'),
        // guide-runtime is built separately via esbuild (needs React inlined as IIFE)
        // UI pages (React)
        'sidepanel': resolve(__dirname, 'public/sidepanel.html'),
        'popup': resolve(__dirname, 'public/popup.html'),
      },
      output: {
        // Content scripts + service worker must be single files (no code splitting)
        entryFileNames: (chunkInfo) => {
          if (['background', 'content', 'redaction', 'guide-runtime'].includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',

      },
    },
  },
}));
