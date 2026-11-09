# Correctifs de dépendances

Copies de dépendances sans version corrigée publiée, avec le seul correctif de sécurité appliqué.

- `glib/` : glib 0.18.5 (imposé par Tauri 2 via gtk 0.18, Linux). Correctif de RUSTSEC-2024-0429 / `VariantStrIter` repris de glib 0.20 (`&mut p` dans `impl_get`, `src/variant_iter.rs`). Branché par `[patch.crates-io]` dans `src-tauri/Cargo.toml` et `installer/Cargo.toml`. À retirer quand Tauri passera à glib 0.20 ou plus.
- `deepmerge/` : deepmerge 4.3.1 (dépendance de build de `@sveltejs/vite-plugin-svelte`). Correctif de GHSA-gcqx-w48m-w2h4 : la clé `__proto__` est ignorée dans `mergeObject`. Branché par `overrides` dans `package.json`. À retirer quand une version corrigée sortira.
