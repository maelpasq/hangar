// Synchro avec le compte Hangar (docs/COMPTE.md, sections 4 et 6) : application des changements
// reçus, file d'envoi, fusion à la première connexion, jeux « Sur un autre PC ». Fonctions pures
// sur l'état ; le réseau passe par le backend (`stores/cloud.svelte.ts`).

import type { CloudChange, Collection, Game, PersistedState, PortableGame, Prefs } from '../types';
import { httpsLink, isGhostId, SYNC_PREFS, syncEntries } from './sync';

/** Limites de l'API (server/src/app.ts) : un élément plus gros bloquerait tout l'envoi. */
export const MAX_CHANGES = 1000;
const MAX_KEY = 512;
const MAX_VALUE = 16 * 1024;

/** Éléments qui disent qu'une bibliothèque a été personnalisée (question de la première connexion). */
const MEANINGFUL = new Set(['fav', 'hidden', 'rename', 'cover', 'collection']);

const kindOf = (key: string) => key.slice(0, key.indexOf(':'));
const restOf = (key: string) => key.slice(key.indexOf(':') + 1);

/** Signature (« @celeste.exe|celeste ») -> jeu local ou manuel de ce poste. */
function realIds(s: PersistedState): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, f] of Object.entries(s.portable)) {
    const pid = `@${f.exe}|${f.dir}`;
    if (!isGhostId(id) && !out.has(pid)) out.set(pid, id);
  }
  return out;
}

/** Identifiant sur ce poste d'un jeu du compte : le jeu local s'il est là, sinon la signature. */
function localId(pid: string, real: Map<string, string>): string {
  return isGhostId(pid) ? (real.get(pid) ?? pid) : pid;
}

function parse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function toggle(list: string[], id: string, on: boolean): string[] {
  const has = list.includes(id);
  if (on === has) return list;
  return on ? [...list, id] : list.filter((x) => x !== id);
}

/** Valeur d'une préférence synchronisée, validée (undefined : refusée). */
function prefValue(k: (typeof SYNC_PREFS)[number], v: unknown): Prefs[typeof k] | undefined {
  switch (k) {
    case 'webGames':
      return v === null || typeof v === 'boolean' ? v : undefined;
    case 'startPage':
      if (v === null || v === 'home' || v === 'library' || v === 'favorites' || v === 'web') return v;
      return typeof v === 'string' && /^collection:.+/.test(v) ? (v as `collection:${string}`) : undefined;
    default:
      return typeof v === 'boolean' ? v : undefined;
  }
}

/**
 * Applique un élément reçu du compte (null : supprimé). Rend « reassert » quand la valeur de ce
 * poste doit l'emporter quand même (date d'ajout plus ancienne, jeu bien installé ici) : elle
 * est alors renvoyée.
 */
function applyEntry(s: PersistedState, key: string, value: string | null, real: Map<string, string>): 'ok' | 'reassert' {
  const rest = restOf(key);
  const v = value === null ? null : parse(value);
  if (v === undefined) return 'ok';
  const id = localId(rest, real);
  switch (kindOf(key)) {
    case 'fav':
      s.favorites = toggle(s.favorites, id, v === true);
      break;
    case 'hidden':
      s.hidden = toggle(s.hidden, id, v === true);
      break;
    case 'rename':
      if (v === null) delete s.renames[id];
      else if (typeof v === 'string' && v.trim() && v.length <= 200) s.renames[id] = v;
      break;
    case 'cover': {
      const cur = s.customCovers[id];
      // Une jaquette en fichier local n'est pas synchronisée : jamais remplacée ni retirée d'ici.
      const synced = cur === undefined || cur === 'none' || cur.startsWith('steam:');
      if (!synced) break;
      if (v === null) delete s.customCovers[id];
      else if (v === 'none' || (typeof v === 'string' && /^steam:\d{1,10}$/.test(v))) s.customCovers[id] = v;
      break;
    }
    case 'seen': {
      // Date d'ajout : la plus ancienne de tous les postes.
      if (!isTime(v)) break;
      const cur = s.firstSeen[id];
      if (cur === undefined || v < cur) s.firstSeen[id] = v;
      else if (cur < v) return 'reassert';
      break;
    }
    case 'web':
      if (v === null) delete s.webPlayed[rest];
      else if (isTime(v)) s.webPlayed[rest] = v;
      break;
    case 'collection': {
      if (v === null) {
        s.collections = s.collections.filter((c) => c.id !== rest);
        break;
      }
      if (typeof v !== 'object' || Array.isArray(v)) break;
      const c = v as { name?: unknown; games?: unknown };
      if (typeof c.name !== 'string' || !c.name.trim() || !Array.isArray(c.games)) break;
      const games = [...new Set(c.games.filter((g): g is string => typeof g === 'string').map((g) => localId(g, real)))];
      const next: Collection = { id: rest, name: c.name.trim().slice(0, 60), games };
      const i = s.collections.findIndex((x) => x.id === rest);
      s.collections = i < 0 ? [...s.collections, next] : s.collections.map((x, j) => (j === i ? next : x));
      break;
    }
    case 'game': {
      if (!isGhostId(rest)) break;
      // Jeu installé ici : sa fiche vient de ce poste.
      if (real.has(rest)) return v === null ? 'reassert' : 'ok';
      if (v === null) {
        delete s.portable[rest];
        break;
      }
      const fiche = ghostFiche(rest, v);
      if (fiche) s.portable[rest] = fiche;
      break;
    }
    case 'set':
      if (rest === 'accent' && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) s.accent = v;
      else if (rest === 'theme' && (v === 'dark' || v === 'light' || v === 'system')) s.theme = v;
      else if (rest === 'sort' && (v === 'recent' || v === 'az' || v === 'hours')) s.sort = v;
      break;
    case 'pref': {
      const k = SYNC_PREFS.find((p) => p === rest);
      const pv = k ? prefValue(k, v) : undefined;
      if (k && pv !== undefined) (s.prefs as unknown as Record<string, unknown>)[k] = pv;
      break;
    }
  }
  return 'ok';
}

/** Fiche d'un jeu du compte d'après sa signature et sa valeur synchronisée. */
function ghostFiche(pid: string, v: unknown): PortableGame | null {
  const bar = pid.indexOf('|');
  if (bar < 2 || typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const g = v as { name?: unknown; steamAppId?: unknown; installUrl?: unknown };
  if (typeof g.name !== 'string' || !g.name.trim()) return null;
  const fiche: PortableGame = { name: g.name.slice(0, 200), exe: pid.slice(1, bar), dir: pid.slice(bar + 1) };
  if (typeof g.steamAppId === 'number' && Number.isSafeInteger(g.steamAppId) && g.steamAppId > 0) fiche.steamAppId = g.steamAppId;
  const url = typeof g.installUrl === 'string' ? httpsLink(g.installUrl) : null;
  if (url) fiche.installUrl = url;
  return fiche;
}

function markDirty(s: PersistedState, keys: string[]): void {
  if (keys.length) s.cloud.dirty = [...new Set([...s.cloud.dirty, ...keys])];
}

/**
 * Applique les changements reçus : la modification la plus récente gagne, élément par élément.
 * Un élément de ce poste plus récent reste dans la file d'envoi. Rend vrai si l'état a changé.
 */
export function applyRemote(s: PersistedState, changes: CloudChange[], now = Date.now()): boolean {
  const real = realIds(s);
  const sent = new Set<string>();
  const reassert: string[] = [];
  let changed = false;
  for (const ch of changes) {
    const local = s.stamps[ch.key];
    if (local !== undefined && local >= ch.updatedAt) continue;
    s.stamps[ch.key] = ch.updatedAt;
    sent.add(ch.key);
    changed = true;
    if (applyEntry(s, ch.key, ch.value, real) === 'reassert') {
      s.stamps[ch.key] = Math.max(now, ch.updatedAt + 1);
      reassert.push(ch.key);
    }
  }
  if (sent.size) s.cloud.dirty = s.cloud.dirty.filter((k) => !sent.has(k) || reassert.includes(k));
  markDirty(s, reassert);
  if (changed) adoptGhosts(s);
  return changed;
}

/**
 * « Utiliser le compte » à la première connexion : la partie synchronisée de ce poste est
 * remplacée par celle du compte. Ce que le compte n'a pas (préférences, jeux installés ici) lui
 * est ensuite envoyé.
 */
export function replaceWithRemote(s: PersistedState, changes: CloudChange[], now = Date.now()): void {
  const alive = new Map<string, CloudChange>();
  for (const ch of changes) if (ch.value !== null) alive.set(ch.key, ch);
  const real = realIds(s);
  for (const key of syncEntries(s).keys()) {
    const kind = kindOf(key);
    if (alive.has(key) || !(MEANINGFUL.has(kind) || (kind === 'game' && !real.has(restOf(key))))) continue;
    applyEntry(s, key, null, real);
  }
  s.cloud.dirty = [];
  for (const ch of alive.values()) {
    s.stamps[ch.key] = ch.updatedAt;
    applyEntry(s, ch.key, ch.value, real);
  }
  adoptGhosts(s);
  const extra: string[] = [];
  for (const [key, value] of syncEntries(s)) {
    if (alive.get(key)?.value === value) continue;
    s.stamps[key] = now;
    extra.push(key);
  }
  markDirty(s, extra);
}

/** Vrai si la bibliothèque a été personnalisée (favoris, collections, renommages...). */
export function hasMeaningful(keys: Iterable<string>): boolean {
  for (const k of keys) if (MEANINGFUL.has(kindOf(k))) return true;
  return false;
}

/** « Fusionner » : tout ce poste part dans la file d'envoi, puis le plus récent gagne. */
export function markAllDirty(s: PersistedState): void {
  s.cloud.dirty = [...new Set([...s.cloud.dirty, ...Object.keys(s.stamps), ...syncEntries(s).keys()])];
  for (const k of s.cloud.dirty) s.stamps[k] ??= Date.now();
}

/** Changements à envoyer (file d'attente), au plus `MAX_CHANGES`. Les éléments trop gros sont écartés. */
export function pendingChanges(s: PersistedState): CloudChange[] {
  if (!s.cloud.dirty.length) return [];
  const cur = syncEntries(s);
  const out: CloudChange[] = [];
  const tooBig: string[] = [];
  for (const key of s.cloud.dirty) {
    const value = cur.get(key) ?? null;
    if (key.length > MAX_KEY || !/^[a-z]+:./s.test(key) || (value !== null && value.length > MAX_VALUE)) {
      tooBig.push(key);
      continue;
    }
    out.push({ key, value, updatedAt: s.stamps[key] ?? Date.now() });
    if (out.length >= MAX_CHANGES) break;
  }
  if (tooBig.length) {
    console.warn('compte Hangar : éléments trop gros, pas synchronisés', tooBig.length);
    s.cloud.dirty = s.cloud.dirty.filter((k) => !tooBig.includes(k));
  }
  return out;
}

/** Envoi réussi : retire de la file les éléments envoyés qui n'ont pas changé depuis. */
export function ackPushed(s: PersistedState, sent: CloudChange[]): void {
  const done = new Set(sent.filter((ch) => s.stamps[ch.key] === ch.updatedAt).map((ch) => ch.key));
  if (done.size) s.cloud.dirty = s.cloud.dirty.filter((k) => !done.has(k));
}

/** Change l'identifiant d'un jeu partout dans l'état (jeu du compte retrouvé sur ce poste). */
function moveId(s: PersistedState, from: string, to: string): void {
  const swap = (list: string[]) => (list.includes(from) ? [...new Set(list.map((x) => (x === from ? to : x)))] : list);
  s.favorites = swap(s.favorites);
  s.hidden = swap(s.hidden);
  s.collections = s.collections.map((c) => (c.games.includes(from) ? { ...c, games: swap(c.games) } : c));
  for (const map of [s.renames, s.customCovers, s.totals, s.installLinks] as Record<string, unknown>[]) {
    if (from in map) {
      if (!(to in map)) map[to] = map[from];
      delete map[from];
    }
  }
  if (from in s.firstSeen) {
    s.firstSeen[to] = Math.min(s.firstSeen[to] ?? Infinity, s.firstSeen[from]);
    delete s.firstSeen[from];
  }
}

/**
 * Rattachement : un jeu du compte (« Sur un autre PC ») trouvé sur ce poste par le scan, même
 * ailleurs, récupère ses personnalisations. Rend vrai si l'état a changé.
 */
export function adoptGhosts(s: PersistedState): boolean {
  const real = realIds(s);
  let changed = false;
  for (const pid of Object.keys(s.portable)) {
    const id = isGhostId(pid) ? real.get(pid) : undefined;
    if (!id) continue;
    moveId(s, pid, id);
    delete s.portable[pid];
    s.cloud.hiddenHere = s.cloud.hiddenHere.filter((x) => x !== pid);
    changed = true;
  }
  return changed;
}

/** Cartes en gris des jeux du compte introuvables sur ce poste (masqués ici compris). */
export function ghostGames(s: PersistedState): Game[] {
  const real = realIds(s);
  const out: Game[] = [];
  for (const [pid, f] of Object.entries(s.portable)) {
    if (!isGhostId(pid) || real.has(pid)) continue;
    out.push({
      id: pid,
      name: f.name,
      store: 'manual',
      installDir: null,
      launch: { kind: 'exe', target: '', args: '' },
      launcherName: "l'exécutable du jeu",
      steamAppId: f.steamAppId ?? null,
      exePath: null,
      processNames: [],
      genre: null,
      notInstalled: true,
      elsewhere: true,
      ...(f.installUrl ? { installUrl: f.installUrl } : {})
    });
  }
  return out;
}
