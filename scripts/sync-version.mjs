// Recopie la version de package.json dans les paquets Rust (app et installeur) et leurs
// Cargo.lock. Lancé par `npm version` (script « version »), avant le commit de version.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version invalide : ${version}`);

const crates = [
  ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'hangar'],
  ['installer/Cargo.toml', 'installer/Cargo.lock', 'hangar-setup']
];

for (const [toml, lock, name] of crates) {
  // Première ligne `version = "..."` : celle de la section [package].
  const t = readFileSync(toml, 'utf8');
  writeFileSync(toml, t.replace(/^version = "[^"]*"/m, `version = "${version}"`));
  // Dans le lockfile, seulement l'entrée du paquet lui-même.
  const l = readFileSync(lock, 'utf8');
  writeFileSync(lock, l.replace(new RegExp(`(name = "${name}"\\r?\\nversion = )"[^"]*"`), `$1"${version}"`));
}
console.log(`Paquets Rust en version ${version}.`);
