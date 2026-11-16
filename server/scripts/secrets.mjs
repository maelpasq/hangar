// Mise en ligne d'un environnement sans jamais afficher les secrets.
//   node scripts/secrets.mjs init            crée .secrets/prod.json et .secrets/test.json à remplir
//   node scripts/secrets.mjs check <env>     liste les champs vides (noms seulement)
//   node scripts/secrets.mjs migrate <env>   applique le schéma à la base Turso de l'environnement
//   node scripts/secrets.mjs push <env>      envoie les secrets au Worker (wrangler secret bulk)
// Le dossier .secrets/ n'est jamais commité ; le supprimer une fois les deux environnements en ligne.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = '.secrets';
const OBLIGATOIRES = ['TURSO_URL', 'TURSO_TOKEN', 'AUTH_SECRET', 'SECRETS_KEY', 'RESEND_API_KEY'];
const FACULTATIFS = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'BUG_WEBHOOK'];

const [cmd, env] = process.argv.slice(2);
const fichier = (e) => join(DIR, `${e}.json`);
const lire = (e) => JSON.parse(readFileSync(fichier(e), 'utf8'));
const run = (args, extraEnv = {}) => {
  const r = spawnSync('npx', args, { stdio: 'inherit', shell: true, env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (cmd === 'init') {
  mkdirSync(DIR, { recursive: true });
  for (const e of ['prod', 'test']) {
    if (existsSync(fichier(e))) { console.log(`${fichier(e)} existe déjà, gardé.`); continue; }
    const o = {};
    for (const k of [...OBLIGATOIRES, ...FACULTATIFS]) o[k] = '';
    // Secrets internes : générés ici, différents par environnement.
    o.AUTH_SECRET = randomBytes(32).toString('base64');
    o.SECRETS_KEY = randomBytes(32).toString('base64');
    writeFileSync(fichier(e), JSON.stringify(o, null, 2) + '\n');
    console.log(`${fichier(e)} créé.`);
  }
} else if (['check', 'migrate', 'push'].includes(cmd) && ['prod', 'test'].includes(env)) {
  const s = lire(env);
  const vides = OBLIGATOIRES.filter((k) => !s[k]);
  const fac = FACULTATIFS.filter((k) => !s[k]);
  if (cmd === 'check') {
    console.log(vides.length ? `${env} : manquant ${vides.join(', ')}` : `${env} : obligatoires OK`);
    if (fac.length) console.log(`${env} : facultatifs vides ${fac.join(', ')}`);
    process.exit(vides.length ? 1 : 0);
  }
  if (vides.length) { console.error(`${env} : manquant ${vides.join(', ')}`); process.exit(1); }
  if (cmd === 'migrate') {
    run(['drizzle-kit', 'migrate'], { TURSO_URL: s.TURSO_URL, TURSO_TOKEN: s.TURSO_TOKEN });
  } else {
    const tmp = join(DIR, `.bulk-${env}.json`);
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(Object.entries(s).filter(([, v]) => v))));
    try { run(['wrangler', 'secret', 'bulk', tmp, '--env', env]); } finally { rmSync(tmp, { force: true }); }
  }
} else {
  console.error('usage : node scripts/secrets.mjs init | check|migrate|push <prod|test>');
  process.exit(1);
}
