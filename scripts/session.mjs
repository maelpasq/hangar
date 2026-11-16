// Une branche par session de travail, pour que plusieurs sessions ne se gênent pas sur `dev` :
//   node scripts/session.mjs start <nom>   crée la branche session/<nom> depuis dev, dans son propre
//                                          dossier (../sessions/<nom>), et affiche ce dossier
//   node scripts/session.mjs finish        depuis ce dossier, après validation et commit : repose la
//                                          branche sur dev puis avance dev dessus (rien n'est poussé)
//   node scripts/session.mjs remove <nom>  supprime le dossier et la branche, une fois fusionnée
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmdirSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const git = (args, cwd = '.') => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

// Le dossier principal (celui de dev) est le premier worktree de la liste.
const worktrees = git(['worktree', 'list', '--porcelain'])
  .split(/\r?\n\r?\n/)
  .map((b) => ({ path: b.match(/^worktree (.+)$/m)?.[1], branch: b.match(/^branch refs\/heads\/(.+)$/m)?.[1] }))
  .filter((w) => w.path);
const main = worktrees[0].path;
const sessionDir = (name) => join(dirname(main), 'sessions', name);
const checkName = (name) => {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name ?? '')) fail('Nom de session attendu : minuscules, chiffres et tirets.');
  return name;
};

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'start') {
  const name = checkName(arg);
  const dir = sessionDir(name);
  if (existsSync(dir)) fail(`La session « ${name} » existe déjà : ${dir}`);
  mkdirSync(dirname(dir), { recursive: true });
  git(['worktree', 'add', '-b', `session/${name}`, dir, 'dev']);
  // Les dépendances du dossier principal sont partagées (lien, pas de copie).
  const modules = join(main, 'node_modules');
  if (existsSync(modules)) symlinkSync(modules, join(dir, 'node_modules'), 'junction');
  console.log(`Session « ${name} » : branche session/${name}, dossier ${resolve(dir)}`);
} else if (cmd === 'finish') {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (['dev', 'main', 'hangar-mc', 'HEAD'].includes(branch)) fail(`« ${branch} » n'est pas une branche de session.`);
  if (git(['status', '--porcelain'])) fail('Des changements ne sont pas commités : commit d\'abord, puis finish.');
  if (worktrees[0].branch !== 'dev') fail(`Le dossier principal (${main}) n'est pas sur dev : rien n'est fait.`);
  try {
    git(['rebase', 'dev']);
  } catch {
    git(['rebase', '--abort']);
    fail(`${branch} ne se repose pas sur dev sans conflit : à régler à la main (git rebase dev).`);
  }
  try {
    git(['merge', '--ff-only', branch], main);
  } catch (e) {
    fail(`dev n'a pas pu avancer sur ${branch} (travail non commité dans ${main} ?) :\n${e.stderr ?? e.message}`);
  }
  console.log(`dev avancée sur ${branch} (${git(['rev-parse', '--short', 'dev'])}).`);
} else if (cmd === 'remove') {
  const name = checkName(arg);
  const dir = sessionDir(name);
  const branch = `session/${name}`;
  if (resolve(process.cwd()).startsWith(resolve(dir))) fail('À lancer depuis le dossier principal, pas depuis la session.');
  try {
    git(['merge-base', '--is-ancestor', branch, 'dev']);
  } catch {
    fail(`${branch} n'est pas fusionnée dans dev : rien n'est supprimé.`);
  }
  if (existsSync(dir)) {
    if (git(['status', '--porcelain'], dir)) fail(`${dir} a des changements non commités : rien n'est supprimé.`);
    // Le lien d'abord (lui seul, jamais les dépendances du dossier principal), puis le dossier.
    const link = join(dir, 'node_modules');
    if (existsSync(link)) rmdirSync(link);
    git(['worktree', 'remove', dir]);
  }
  git(['branch', '-d', branch]);
  console.log(`Session « ${name} » supprimée.`);
} else {
  fail('Usage : node scripts/session.mjs start <nom> | finish | remove <nom>');
}
