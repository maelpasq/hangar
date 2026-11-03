import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Configuration Vite partagée par `npm run dev` (Tauri) et `npm run dev:web` (navigateur + mock).
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  build: {
    target: 'chrome120',
    outDir: 'dist',
    emptyOutDir: true
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
