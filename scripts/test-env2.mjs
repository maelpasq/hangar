// Deuxième environnement de test (`npm run test-env2`), pour essayer le compte Hangar entre deux
// « postes » sur la même machine : identité, données et coffre à part (« Hangar Test 2 »,
// tauri.test2.conf.json), sans toucher ni à Hangar ni à Hangar Test. Compilé depuis le dossier
// courant, sans Hangar MC, copié dans %LOCALAPPDATA%\Hangar Test 2 puis lancé.
// `npm run test-env2 -- --clean` le supprime avec ses données (pas son coffre).
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

if (process.platform !== 'win32') throw new Error('Hangar Test 2 : Windows seulement');

const dir = join(process.env.LOCALAPPDATA, 'Hangar Test 2');
const exe = join(dir, 'hangar-test-2.exe');
const kill = () => {
  try {
    execSync('taskkill /IM hangar-test-2.exe /F', { stdio: 'ignore' });
  } catch {
    // pas lancé
  }
};

if (process.argv.includes('--clean')) {
  kill();
  rmSync(dir, { recursive: true, force: true });
  for (const base of [process.env.APPDATA, process.env.LOCALAPPDATA]) {
    rmSync(join(base, 'studio.pamal.hangar2.test'), { recursive: true, force: true });
  }
  console.log('Hangar Test 2 supprimée avec ses données.');
  process.exit(0);
}

execSync('npx tauri build --config src-tauri/tauri.test2.conf.json --no-bundle', { stdio: 'inherit' });
const target = execSync('cargo metadata --format-version 1 --no-deps', { cwd: 'src-tauri', encoding: 'utf8' });
const built = join(JSON.parse(target).target_directory, 'release', 'hangar-test-2.exe');

kill();
mkdirSync(dir, { recursive: true });
copyFileSync(built, exe);
spawn('explorer.exe', [exe], { detached: true, stdio: 'ignore' }).unref();
console.log(`Hangar Test 2 lancée : ${exe}`);
