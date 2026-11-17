// Socle du compte Hangar (docs/COMPTE.md, phase 0) : ce qui est synchronisable dans l'état,
// élément par élément, et la date de dernière modification de chacun. Rien ne part sur le
// réseau ici : tout reste dans state.json.

import type { Game, PersistedState, PortableGame, Prefs, SocialGame } from '../types';

/** Préférences « de goût », qui suivent la personne. */
export const SYNC_PREFS = ['autoCovers', 'showUninstalled', 'webGames', 'discordPresence', 'startPage', 'showcase', 'profileGames'] as const;
/** Préférences liées à la machine, qui restent sur le poste. */
export const LOCAL_PREFS = [
  'minimizeOnLaunch',
  'startWithWindows',
  'steamGridDb',
  'closeAction',
  'globalShortcut',
  'padButton',
  'padAtLogin'
] as const;

// Chaque préférence est rangée d'un côté ou de l'autre : une nouvelle clé oubliée ne compile pas.
type Unsorted = Exclude<keyof Prefs, (typeof SYNC_PREFS)[number] | (typeof LOCAL_PREFS)[number]>;
const _sorted: Unsorted extends never ? true : never = true;
void _sorted;

/** Jeux favoris du profil au plus. */
export const MAX_PROFILE_GAMES = 5;

/** Jeux favoris du profil validés (identifiant portable et nom, sans doublon), sinon undefined. */
export function profileGamesOf(v: unknown): SocialGame[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: SocialGame[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const { id, name } = x as Record<string, unknown>;
    if (typeof id !== 'string' || !id || id.length > 512 || typeof name !== 'string' || !name.trim()) continue;
    if (!out.some((g) => g.id === id)) out.push({ id, name: name.trim().slice(0, 200) });
  }
  return out.slice(0, MAX_PROFILE_GAMES);
}

/** Lien `https://` propre, sinon null (même règle que le backend, `scanner/links.rs`). */
export function httpsLink(raw: string): string | null {
  const url = raw.trim();
  if (url.length > 500 || !/^https:\/\/[a-z0-9.-]+\.[a-z0-9-]+(:\d+)?([/?#][\x21-\x7e]*)?$/i.test(url)) return null;
  return /["<>\\`|^]/.test(url) ? null : url;
}

/** Domaine affiché sur le bouton (« celestegame.com »). */
export function linkDomain(url: string): string {
  return url.replace(/^https:\/\//i, '').split(/[/?#:]/)[0].replace(/^www\./i, '').toLowerCase();
}

const isPathId = (id: string) => id.startsWith('local:') || id.startsWith('manual:');
/** Jeu du compte introuvable sur ce poste : son identifiant est sa signature (« @celeste.exe|celeste »). */
export const isGhostId = (id: string) => id.startsWith('@');
const base = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop()!.toLowerCase();

/** Signature portable d'un jeu local ou manuel : nom de l'exécutable et nom de son dossier. */
export function signature(g: Game): { exe: string; dir: string } | null {
  if (!isPathId(g.id)) return null;
  const exe = base(g.exePath || g.launch.target || '');
  if (!exe) return null;
  return { exe, dir: g.installDir ? base(g.installDir) : '' };
}

/** Page du jeu sur le magasin Steam (lien de secours, moins utile que le site officiel). */
export const isSteamPage = (url: string) => /^https:\/\/store\.steampowered\.com\/app\//i.test(url);

/** Appid Steam connu d'un jeu hors store (celui de sa fiche pour un jeu d'un autre PC). */
export function steamIdOf(s: PersistedState, g: Game): number | null {
  const fiche = isGhostId(g.id) ? s.portable[g.id] : undefined;
  return fiche?.steamAppId || g.steamAppId || s.steamIdCache[g.id] || null;
}

const officialOf = (s: PersistedState, appid: number | null) => (appid && s.officialSites[appid]) || null;

/**
 * Lien d'installation d'un jeu hors store : celui choisi par l'utilisateur, sinon celui trouvé au
 * scan (registre, raccourci Internet), sinon le site officiel lu sur sa fiche Steam, sinon la
 * page Steam si le jeu y a été reconnu. Jeu d'un autre PC : le lien de sa fiche, le site
 * officiel passant avant une simple page Steam.
 */
export function installLink(s: PersistedState, g: Game): string | null {
  if (isGhostId(g.id)) {
    const url = s.portable[g.id]?.installUrl ?? null;
    if (url && !isSteamPage(url)) return url;
    return officialOf(s, steamIdOf(s, g)) ?? url;
  }
  if (!isPathId(g.id)) return null;
  const own = s.installLinks[g.id];
  if (own !== undefined) return own ? httpsLink(own) : null;
  if (g.installUrl && httpsLink(g.installUrl)) return g.installUrl;
  const appid = steamIdOf(s, g);
  return officialOf(s, appid) ?? (appid ? `https://store.steampowered.com/app/${appid}` : null);
}

/**
 * Appid dont il faut encore chercher le site officiel pour ce jeu (null : lien déjà trouvé
 * autrement, déjà cherché, ou jeu inconnu de Steam).
 */
export function officialSiteToFind(s: PersistedState, g: Game): number | null {
  if (!isGhostId(g.id) && !isPathId(g.id)) return null;
  if (s.installLinks[g.id] !== undefined) return null;
  const appid = steamIdOf(s, g);
  if (!appid || appid in s.officialSites) return null;
  const url = installLink(s, g);
  return !url || isSteamPage(url) ? appid : null;
}

/** Clé de `officialSites` pour le site trouvé sur Wikidata d'après le nom d'un jeu ("" : nom vide). */
export function wikidataKey(name: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
  return n ? `wd:${n}` : '';
}

/** Choix de la popup « Installer » : un seul site officiel, le launcher maison, la page Steam. */
export interface InstallChoices {
  site: string | null;
  steam: string | null;
  /** Launcher exigé par le jeu d'après sa fiche Steam (Ubisoft Connect pour Rainbow Six Siege...). */
  launcher: StorePage | null;
}

const LAUNCHER_STORES: readonly string[] = ['ubisoft', 'ea', 'battlenet', 'rockstar', 'riot', 'epic'];

/** Launcher maison d'un appid, lu sur sa fiche Steam (null : aucun, ou pas encore cherché). */
export function launcherOf(s: PersistedState, appid: number | null): StorePage | null {
  const l = appid ? s.gameLaunchers[appid] : '';
  return l && LAUNCHER_STORES.includes(l) ? (l as StorePage) : null;
}

/** Premier lien https qui n'est pas une page Steam. */
const firstSite = (urls: (string | null | undefined)[]) => urls.find((u): u is string => !!u && !!httpsLink(u) && !isSteamPage(u)) ?? null;

/**
 * Choix pour installer un jeu hors store. Un seul site officiel : le lien choisi par
 * l'utilisateur ou trouvé au scan (ou celui de la fiche d'un autre PC), sinon Wikidata (tenu à
 * jour), sinon la fiche Steam (souvent l'adresse d'origine du jeu, parfois périmée). Puis sa
 * page Steam et son launcher maison. `foundAppid` : appid trouvé d'après son nom.
 */
export function installChoices(s: PersistedState, g: Game, names: string[], foundAppid: number | null = null): InstallChoices {
  const appid = steamIdOf(s, g) ?? foundAppid;
  const steamSite = officialOf(s, appid);
  let own: string | null | undefined;
  if (isGhostId(g.id)) {
    // Lien de l'autre PC : simple copie du site de la fiche Steam ? Wikidata passe alors devant.
    own = s.portable[g.id]?.installUrl;
    if (own && steamSite && linkDomain(own) === linkDomain(steamSite)) own = null;
  } else if (isPathId(g.id)) {
    const chosen = s.installLinks[g.id];
    if (chosen !== undefined) own = chosen ? httpsLink(chosen) : null;
    else own = g.installUrl;
  }
  return {
    site: firstSite([own, ...names.map((n) => s.officialSites[wikidataKey(n)]), steamSite]),
    steam: appid ? `https://store.steampowered.com/app/${appid}` : null,
    launcher: launcherOf(s, appid)
  };
}

/**
 * Choix pour installer un jeu vu chez un ami et absent d'ici (seuls son identifiant et son nom
 * sont connus) : son site officiel (Wikidata, sinon sa fiche Steam), sa page Steam, son launcher.
 */
export function socialInstallChoices(s: PersistedState, name: string, appid: number | null): InstallChoices {
  return {
    site: firstSite([s.officialSites[wikidataKey(name)], officialOf(s, appid)]),
    steam: appid ? `https://store.steampowered.com/app/${appid}` : null,
    launcher: launcherOf(s, appid)
  };
}

/** Appid Steam d'un identifiant portable (« steam:620 »), sinon null. */
export function steamIdFromPortable(id: string): number | null {
  const m = /^steam:(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

export type StorePage = 'steam' | 'gog' | 'battlenet' | 'xbox' | 'epic' | 'ubisoft' | 'ea' | 'riot' | 'rockstar';

/**
 * Store dont le launcher sait ouvrir la page d'un jeu vu chez un ami (même règle que
 * `launcher::store_page` : Steam, GOG et Battle.net partout, les autres sous Windows
 * seulement), sinon null.
 */
export function storePageOf(id: string, windows: boolean): StorePage | null {
  const i = id.indexOf(':');
  const store = id.slice(0, i);
  const key = id.slice(i + 1);
  if (i < 0 || !key || key.length > 200) return null;
  if ((store === 'steam' || store === 'gog') && /^\d+$/.test(key)) return store;
  if (store === 'battlenet' && /^[a-z0-9]+$/i.test(key)) return store;
  if (!windows) return null;
  if (store === 'xbox' && /^[a-z0-9._-]+$/i.test(key)) return store;
  if (store === 'ubisoft' && /^\d+$/.test(key)) return store;
  if (store === 'riot' && /^[a-z0-9_]+$/i.test(key)) return store;
  if (store === 'epic' || store === 'ea' || store === 'rockstar') return store;
  return null;
}

/** Fiche portable à jour d'un jeu local ou manuel (null : pas de signature possible). */
export function portableOf(s: PersistedState, g: Game): PortableGame | null {
  // Rattaché à la main à un jeu du compte (« J'ai déjà ce jeu ») : il en garde la signature.
  const alias = isPathId(g.id) ? s.cloud.aliases[g.id] : undefined;
  const sig = alias ? { ...alias } : signature(g);
  if (!sig) return null;
  const fiche: PortableGame = { name: g.name, ...sig };
  const appid = g.steamAppId || s.steamIdCache[g.id];
  if (appid) fiche.steamAppId = appid;
  const url = installLink(s, g);
  if (url) fiche.installUrl = url;
  return fiche;
}

/**
 * Identifiant d'un jeu valable sur tous les postes : celui du store tel quel, ou la signature
 * (« @celeste.exe|celeste ») d'un jeu local ou manuel. null : jeu sans fiche, pas synchronisable.
 */
export function portableId(s: PersistedState, gameId: string): string | null {
  if (!isPathId(gameId)) return gameId;
  const f = s.portable[gameId];
  return f ? `@${f.exe}|${f.dir}` : null;
}

/**
 * Partie synchronisable de l'état, un élément par clé. Tout ce qui n'est pas ici reste sur le
 * poste (dossiers locaux, cache, stores désactivés, jaquettes en fichiers locaux...). Les
 * sessions et le temps de jeu suivent leur propre règle (ajout seulement, COMPTE.md section 6).
 */
export function syncEntries(s: PersistedState): Map<string, string> {
  const out = new Map<string, string>();
  const put = (kind: string, key: string | null, value: unknown) => {
    if (key !== null) out.set(`${kind}:${key}`, JSON.stringify(value));
  };
  const pid = (id: string) => portableId(s, id);

  for (const id of s.favorites) put('fav', pid(id), true);
  for (const id of s.hidden) put('hidden', pid(id), true);
  for (const [id, name] of Object.entries(s.renames)) put('rename', pid(id), name);
  for (const [id, cover] of Object.entries(s.customCovers)) {
    if (cover === 'none' || cover.startsWith('steam:')) put('cover', pid(id), cover);
    else if (s.cloud.coverHash[cover]) put('cover', pid(id), `file:${s.cloud.coverHash[cover]}`);
  }
  for (const [id, at] of Object.entries(s.firstSeen)) put('seen', pid(id), at);
  for (const [id, at] of Object.entries(s.webPlayed)) put('web', id, at);
  for (const c of s.collections) {
    put('collection', c.id, { name: c.name, games: c.games.map(pid).filter((x) => x !== null) });
  }
  for (const [id, f] of Object.entries(s.portable)) {
    put('game', pid(id), { name: f.name, steamAppId: f.steamAppId ?? null, installUrl: f.installUrl ?? null });
  }
  put('set', 'accent', s.accent);
  put('set', 'theme', s.theme);
  put('set', 'sort', s.sort);
  for (const k of SYNC_PREFS) put('pref', k, s.prefs[k]);
  return out;
}

/**
 * Date les éléments qui ont changé depuis `prev` (ajout, modification, suppression) et renvoie les
 * éléments courants, à repasser au prochain appel. Sans `prev` (premier appel après le chargement,
 * donc aussi la migration depuis la version 1), seuls les éléments encore sans date sont datés.
 */
export function stampChanges(s: PersistedState, prev: Map<string, string> | null, now = Date.now()): Map<string, string> {
  const cur = syncEntries(s);
  const changed: string[] = [];
  for (const [key, value] of cur) {
    if (prev ? prev.get(key) !== value : s.stamps[key] === undefined) changed.push(key);
  }
  if (prev) for (const key of prev.keys()) if (!cur.has(key)) changed.push(key);
  for (const key of changed) s.stamps[key] = now;
  // File d'envoi vers le compte, gardée hors ligne. Sans compte synchronisé, rien : la première
  // synchro prend de toute façon tout.
  if (changed.length && s.cloud.merged) s.cloud.dirty = [...new Set([...s.cloud.dirty, ...changed])];
  return cur;
}
