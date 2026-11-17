import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Dashboard d'administration (docs/ADMIN.md) : `npm run admin:dev` (données de démo, aucun réseau),
// `npm run admin:build` (admin/dist, servi par le Worker du serveur sur son adresse à lui).
const repo = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  plugins: [svelte({ configFile: fileURLToPath(new URL('../svelte.config.js', import.meta.url)) })],
  clearScreen: false,
  // Le dépôt entier (tokens, composants de l'app), et node_modules même quand c'est un lien
  // (worktree de session) : sinon la police est refusée.
  server: {
    port: 1430,
    strictPort: true,
    fs: { allow: [repo, realpathSync(new URL('../node_modules', import.meta.url))] }
  },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true }
});
