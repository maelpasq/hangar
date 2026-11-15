// Toutes les vérifications avant un commit, avec une sortie courte :
// une ligne par étape réussie, la fin du journal seulement en cas d'échec.
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// Dans le dossier d'une branche de session (scripts/session.mjs), cargo réutilise le dossier de
// compilation du dossier principal : les dépendances ne sont pas recompilées pour chaque session.
const git = (args) => execSync(`git ${args}`, { encoding: 'utf8' }).trim();
if (!process.env.CARGO_TARGET_DIR && git('rev-parse --abbrev-ref HEAD').startsWith('session/')) {
  const main = git('worktree list --porcelain').match(/^worktree (.+)$/m)[1];
  process.env.CARGO_TARGET_DIR = `${main}/src-tauri/target`;
}

const steps = [
  ['check', 'npm run check'],
  ['test', 'npx vitest run --reporter=dot'],
  ['cargo test', 'cargo test -q --manifest-path src-tauri/Cargo.toml'],
  ['clippy', 'cargo clippy -q --manifest-path src-tauri/Cargo.toml -- -D warnings'],
];
// Le serveur du compte (server/) a ses propres dépendances : vérifié quand elles sont installées.
if (existsSync('server/node_modules')) steps.push(['serveur', 'npm --prefix server run verify']);

for (const [name, cmd] of steps) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    const out = `${r.stdout}\n${r.stderr}`.trim().split('\n');
    console.error(`ÉCHEC ${name}\n${out.slice(-60).join('\n')}`);
    process.exit(1);
  }
  console.log(`ok ${name}`);
}

// Le tiret cadratin est interdit partout (fichiers suivis et nouveaux).
const dash = String.fromCharCode(0x2014);
const files = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const hits = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  text.split('\n').forEach((l, i) => { if (l.includes(dash)) hits.push(`${f}:${i + 1}`); });
}
if (hits.length) {
  console.error(`ÉCHEC tirets cadratins\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('ok tirets cadratins');
