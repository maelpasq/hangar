// Correctif sans patch note : 1.2.27 -> 1.2.27.1 -> 1.2.27.2 (voir docs/RELEASES.md).
// Semver n'accepte que trois nombres : le 4e est une métadonnée de build (`1.2.27+1`), que la
// mise à jour de Tauri classe bien au-dessus de 1.2.27 et que Hangar affiche « 1.2.27.1 ».
// Fait comme `npm version` : numéro partout, commit « Version 1.2.27.1 », tag annoté `v1.2.27+1`.
// Les arguments sont ajoutés au message du commit (par exemple une ligne Co-Authored-By).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (git('status', '--porcelain')) throw new Error("Des changements ne sont pas commités : committe-les d'abord.");

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const m = /^(\d+\.\d+\.\d+)(?:\+(\d+))?$/.exec(version);
if (!m) throw new Error(`version invalide : ${version}`);
const next = `${m[1]}+${Number(m[2] ?? 0) + 1}`;
const shown = next.replace('+', '.');

const pkg = readFileSync('package.json', 'utf8');
writeFileSync('package.json', pkg.replace(/"version": "[^"]*"/, `"version": "${next}"`));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
lock.version = next;
lock.packages[''].version = next;
writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

execFileSync('node', ['scripts/sync-version.mjs'], { stdio: 'inherit' });

const files = ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'installer/Cargo.toml', 'installer/Cargo.lock'];
git('add', ...files);
git('commit', '-q', '-m', [`Version ${shown}`, ...process.argv.slice(2)].join('\n\n'));
git('tag', '-a', `v${next}`, '-m', `Version ${shown}`);
console.log(`Correctif ${shown} prêt (tag v${next}). Pousse-le avec : git push --follow-tags origin main`);
