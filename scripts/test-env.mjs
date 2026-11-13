// Supprime l'environnement de test de Hangar (`npm run test-env:clean`) : ses dossiers de
// données, ses comptes dans le coffre du système et son démarrage automatique.
// Ne touche jamais à l'app installée : tout ce qui est effacé porte l'identité « .test ».
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ID = 'studio.pamal.hangar.test';
const NAME = 'Hangar Test';
if (!ID.endsWith('.test')) throw new Error('identité de test invalide');

const home = homedir();
const dirs =
  process.platform === 'win32'
    ? [
        ...[process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean).map((d) => join(d, ID))
      ]
    : [
        join(home, 'Library', 'Application Support', ID),
        join(home, 'Library', 'Caches', ID),
        join(home, 'Library', 'Logs', ID),
        join(home, 'Library', 'WebKit', ID),
        join(home, 'Library', 'LaunchAgents', `${NAME}.plist`)
      ];

for (const d of dirs) {
  // garde-fou : jamais un autre chemin
  if (!d.includes(ID) && !d.includes(NAME)) continue;
  if (existsSync(d)) {
    rmSync(d, { recursive: true, force: true });
    console.log(`supprimé : ${d}`);
  }
}

// Commande système sans fenêtre ; une entrée absente n'est pas une erreur.
const quiet = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
};

// Toutes les entrées du coffre de test (compte-steam, compte-gog...), et rien d'autre.
if (process.platform === 'win32') {
  let list = '';
  try {
    list = execFileSync('cmdkey', ['/list'], { encoding: 'utf8', windowsHide: true });
  } catch {
    // coffre illisible : rien à retirer
  }
  const targets = new Set(list.match(new RegExp(String.raw`compte-[\w-]+\.` + NAME, 'g')) ?? []);
  for (const t of targets) quiet('cmdkey', [`/delete:${t}`]);
} else {
  // Chaque appel retire une entrée du service « Hangar Test » ; on s'arrête quand il n'y en a plus.
  for (let i = 0; i < 100 && quiet('security', ['delete-generic-password', '-s', NAME]); i++);
}
console.log(`coffre : comptes de test « ${NAME} » retirés`);

if (process.platform === 'win32') {
  const run = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  if (quiet('reg', ['delete', run, '/v', NAME, '/f'])) console.log('démarrage automatique de test retiré');
}

console.log("Environnement de test supprimé. L'app installée n'a pas été touchée.");
