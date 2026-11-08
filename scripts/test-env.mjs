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
        ...[process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean).map((d) => join(d, ID)),
        ...(process.env.APPDATA ? [join(process.env.APPDATA, '.hangarmc-test')] : [])
      ]
    : [
        join(home, 'Library', 'Application Support', 'hangarmc-test'),
        join(home, 'Library', 'Application Support', ID),
        join(home, 'Library', 'Caches', ID),
        join(home, 'Library', 'Logs', ID),
        join(home, 'Library', 'WebKit', ID),
        join(home, 'Library', 'LaunchAgents', `${NAME}.plist`)
      ];

for (const d of dirs) {
  // garde-fou : jamais un autre chemin (Hangar MC de l'app installée : `.hangarmc`, sans -test)
  if (!d.includes(ID) && !d.includes(NAME) && !d.endsWith('hangarmc-test')) continue;
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

// `cmdkey /delete` réussit aussi quand l'entrée n'existe pas : on n'annonce rien de précis.
for (const store of ['steam', 'gog', 'epic', 'minecraft']) {
  if (process.platform === 'win32') quiet('cmdkey', [`/delete:compte-${store}.${NAME}`]);
  else quiet('security', ['delete-generic-password', '-s', NAME, '-a', `compte-${store}`]);
}
console.log(`coffre : comptes de test « ${NAME} » retirés`);

if (process.platform === 'win32') {
  const run = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  if (quiet('reg', ['delete', run, '/v', NAME, '/f'])) console.log('démarrage automatique de test retiré');
}

console.log("Environnement de test supprimé. L'app installée n'a pas été touchée.");
