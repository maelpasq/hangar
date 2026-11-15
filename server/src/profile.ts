// Profil du compte (docs/COMPTE.md, phase 5) : pseudo, avatar (R2) et visibilité.
//
// - Pseudo : `user.name` (table de Better Auth).
// - Avatar : un objet R2 par compte ; `user.image` vaut `r2:<version>`. À la connexion par Discord
//   ou Google, `user.image` est l'adresse de l'avatar du service : copiée dans R2 à la première
//   demande (l'app ne contacte jamais ces services).
// - Visibilité : l'élément `profile:public` du compte (table `entries`), privé par défaut.

/** Taille maximale d'un avatar (l'app envoie un carré de 256 px). */
export const AVATAR_MAX = 512 * 1024;
export const PUBLIC_KEY = 'profile:public';
/** Services de connexion dont l'avatar peut être copié. */
const PROVIDER_HOSTS = ['cdn.discordapp.com', 'lh3.googleusercontent.com'];
const USER_ID = /^[A-Za-z0-9_-]{8,64}$/;

export const avatarKey = (userId: string) => `avatars/${userId}`;
export const isUserId = (id: string) => USER_ID.test(id);

/** Type d'une image d'après ses premiers octets (jamais d'après ce qu'annonce l'envoi). */
export function imageType(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  return null;
}

/** Adresse d'avatar d'un service de connexion, si elle peut être copiée. */
export function providerAvatar(image: string | null): string | null {
  if (!image) return null;
  try {
    const u = new URL(image);
    return u.protocol === 'https:' && PROVIDER_HOSTS.includes(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** Nouvelle version d'avatar (l'app ne retélécharge l'image que quand elle change). */
export const avatarVersion = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Pseudo valide : 2 à 32 caractères, sans caractère de contrôle ni espaces multiples. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.replace(/\s+/g, ' ').trim();
  const len = [...name].length;
  if (len < 2 || len > 32 || /[\p{Cc}\p{Cf}]/u.test(name)) return null;
  return name;
}

/**
 * Temps de jeu mesuré par Hangar seul (parties lancées depuis Hangar), tous jeux et tous postes
 * additionnés, sans les heures de Steam ou GOG. Chaque poste le publie dans ses éléments
 * `time:<poste>:<jeu>` (champ `h`) ; une version de l'app qui ne l'envoie pas encore compte son
 * temps entier, sauf pour les jeux où il contient celui du store (`s: 1`).
 */
export function totalPlay(rows: { key: string; value: string | null }[]): { playMs: number; games: number } {
  const ms = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const games = new Set<string>();
  let playMs = 0;
  for (const r of rows) {
    if (!r.value) continue;
    const rest = r.key.slice('time:'.length);
    const pid = rest.slice(rest.indexOf(':') + 1);
    let t: { ms?: unknown; s?: unknown; h?: unknown };
    try {
      t = JSON.parse(r.value);
    } catch {
      continue;
    }
    if (!pid || typeof t !== 'object' || t === null) continue;
    const measured = 'h' in t ? ms(t.h) : t.s === 1 ? 0 : ms(t.ms);
    if (!measured) continue;
    playMs += measured;
    games.add(pid);
  }
  return { playMs, games: games.size };
}

/** Image en `data:` pour la page publique (qui ne charge rien d'ailleurs). */
export function dataUrl(type: string, bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(s)}`;
}
