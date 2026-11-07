// Toutes les vérifications avant un commit, avec une sortie courte :
// une ligne par étape réussie, la fin du journal seulement en cas d'échec.
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const steps = [
  ['check', 'npm run check'],
  ['test', 'npx vitest run --reporter=dot'],
  ['cargo test', 'cargo test -q --manifest-path src-tauri/Cargo.toml'],
  ['clippy', 'cargo clippy -q --manifest-path src-tauri/Cargo.toml -- -D warnings'],
];

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
