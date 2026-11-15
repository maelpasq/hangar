// Synchro avec le compte Hangar (docs/COMPTE.md, sections 4 et 6) : application des changements
// reçus, file d'envoi, fusion à la première connexion, jeux « Sur un autre PC ». Fonctions pures
// sur l'état ; le réseau passe par le backend (`stores/cloud.svelte.ts`).

import type { CloudChange, CloudSession, Collection, DeviceTime, Game, PersistedState, PortableGame, Prefs } from '../types';
import { DEVICE_ID, SESSION_DAYS } from './state';
import { httpsLink, isGhostId, portableId, SYNC_PREFS, syncEntries } from './sync';

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
    // Temps de jeu d'un poste : à part, jamais daté ni renvoyé comme les autres éléments.
    if (kindOf(ch.key) === 'time') {
      if (applyTime(s, ch)) changed = true;
      continue;
    }
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
  for (const ch of changes) {
    if (kindOf(ch.key) === 'time') applyTime(s, ch);
    else if (ch.value !== null) alive.set(ch.key, ch);
  }
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
  if (s.sessions.some((x) => x.gameId === from)) {
    s.sessions = s.sessions.map((x) => (x.gameId === from ? { ...x, gameId: to } : x));
  }
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

// --- Temps de jeu cumulé (docs/COMPTE.md, phase 4) ---
// Chaque poste publie ses propres totaux, un élément par jeu (« time:<poste>:<jeu> ») ; le
// temps affiché additionne les postes. Les sessions (ajout seulement) font l'historique.

/** Une partie finie depuis ce délai sans point d'étape (un par minute) ne bougera plus. */
const SETTLED = 3 * 60_000;

const timeKey = (deviceId: string, pid: string) => `time:${deviceId}:${pid}`;

/** Temps de jeu d'un autre poste reçu du compte. Rend vrai s'il a changé. */
function applyTime(s: PersistedState, ch: CloudChange): boolean {
  const rest = restOf(ch.key);
  const colon = rest.indexOf(':');
  const dev = rest.slice(0, colon);
  const pid = rest.slice(colon + 1);
  // Les temps de ce poste viennent de lui : jamais remplacés par leur copie du compte.
  if (colon < 0 || !pid || !DEVICE_ID.test(dev) || dev === s.deviceId) return false;
  const games = s.cloud.times[dev] ?? {};
  const cur = games[pid];
  if (cur && cur.at >= ch.updatedAt) return false;
  if (ch.value === null) {
    if (!cur) return false;
    delete games[pid];
  } else {
    const t = wireTime(parse(ch.value), ch.updatedAt);
    if (!t) return false;
    games[pid] = t;
  }
  s.cloud.times[dev] = games;
  return true;
}

function wireTime(v: unknown, at: number): DeviceTime | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const t = v as { ms?: unknown; n?: unknown; last?: unknown; s?: unknown };
  if (!isTime(t.ms) || !isTime(t.n) || !isTime(t.last)) return null;
  return { playMs: t.ms, launches: t.n, lastPlayed: t.last, store: t.s === 1, at };
}

/**
 * Temps mesuré par Hangar seul sur ce poste (sans les heures du store). Avant son suivi
 * (`hangarMs`), estimé : le temps du jeu quand le store ne compte rien (Hangar seul l'a mesuré),
 * sinon les sessions gardées de ce poste (90 jours).
 */
export function measuredMs(s: PersistedState, id: string, storeCounted: boolean): number {
  const t = s.totals[id];
  if (t?.hangarMs !== undefined) return t.hangarMs;
  if (!storeCounted) return t?.playMs ?? 0;
  return s.sessions.reduce((sum, x) => (!x.deviceId && x.gameId === id ? sum + Math.max(0, x.end - x.start) : sum), 0);
}

/**
 * Temps de jeu de ce poste qui ont changé depuis le dernier envoi (au plus `MAX_CHANGES`).
 * `storeCounted` : le store compte déjà ce jeu sur tous les postes (Steam, GOG Galaxy).
 * `h` : le temps mesuré par Hangar seul (profil public).
 */
export function timeChanges(s: PersistedState, storeCounted: (id: string) => boolean, now = Date.now()): CloudChange[] {
  const out: CloudChange[] = [];
  for (const [id, t] of Object.entries(s.totals)) {
    if ((!t.playMs && !t.launches) || isGhostId(id)) continue;
    const pid = portableId(s, id);
    if (pid === null) continue;
    const key = timeKey(s.deviceId, pid);
    const counted = storeCounted(id);
    const value = JSON.stringify({
      ms: Math.round(t.playMs),
      n: Math.round(t.launches),
      last: Math.round(t.lastPlayed),
      ...(counted ? { s: 1 } : {}),
      h: Math.round(measuredMs(s, id, counted))
    });
    if (key.length > MAX_KEY || s.cloud.timeSent[key] === value) continue;
    out.push({ key, value, updatedAt: now });
    if (out.length >= MAX_CHANGES) break;
  }
  return out;
}

/** Envoi des temps de jeu réussi. */
export function ackTimes(s: PersistedState, sent: CloudChange[]): void {
  for (const ch of sent) if (ch.value !== null) s.cloud.timeSent[ch.key] = ch.value;
}

/** Temps de jeu d'un jeu sur les autres postes, par poste. */
export function remoteTimes(s: PersistedState, gameId: string): [string, DeviceTime][] {
  const pid = portableId(s, gameId);
  if (pid === null) return [];
  const out: [string, DeviceTime][] = [];
  for (const [dev, games] of Object.entries(s.cloud.times)) {
    const t = games[pid];
    if (t) out.push([dev, t]);
  }
  return out;
}

/** FNV-1a 32 bits, en hexadécimal. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Identifiant sur le compte d'une session de ce poste : toujours le même (un renvoi est ignoré). */
export function sessionId(deviceId: string, pid: string, start: number): string {
  return `${deviceId}-${Math.round(start).toString(36)}-${hash(pid)}`;
}

/** Sessions finies de ce poste pas encore envoyées (au plus `MAX_CHANGES`). */
export function pendingSessions(s: PersistedState, now = Date.now()): CloudSession[] {
  const out: CloudSession[] = [];
  for (const x of s.sessions) {
    if (x.deviceId || x.sent || (!x.done && x.end > now - SETTLED)) continue;
    const pid = portableId(s, x.gameId);
    if (pid === null || pid.length > MAX_KEY) continue;
    const start = Math.round(x.start);
    out.push({ id: sessionId(s.deviceId, pid, start), gameId: pid, start, end: Math.max(start, Math.round(x.end)) });
    if (out.length >= MAX_CHANGES) break;
  }
  return out;
}

/** Envoi des sessions réussi. */
export function ackSessions(s: PersistedState, sent: CloudSession[]): void {
  const ids = new Set(sent.map((x) => x.id));
  for (const x of s.sessions) {
    if (x.deviceId || x.sent) continue;
    const pid = portableId(s, x.gameId);
    if (pid !== null && ids.has(sessionId(s.deviceId, pid, x.start))) x.sent = true;
  }
}

/** Sessions des autres postes reçues du compte (90 derniers jours). Rend vrai si l'état a changé. */
export function applyRemoteSessions(s: PersistedState, list: CloudSession[], now = Date.now()): boolean {
  const real = realIds(s);
  const known = new Set(s.sessions.map((x) => x.id).filter((x) => x !== undefined));
  const min = now - SESSION_DAYS * 86_400_000;
  const added: PersistedState['sessions'] = [];
  for (const r of list) {
    const dev = r.deviceId;
    if (!dev || dev === s.deviceId || !DEVICE_ID.test(dev) || known.has(r.id)) continue;
    if (!r.gameId || !isTime(r.start) || !isTime(r.end) || r.end < r.start || r.end < min) continue;
    known.add(r.id);
    added.push({ gameId: localId(r.gameId, real), start: r.start, end: r.end, deviceId: dev, id: r.id });
  }
  if (added.length) s.sessions = [...s.sessions, ...added];
  return added.length > 0;
}

/**
 * Poste détaché du compte (déconnexion) : la prochaine connexion renverra tout. Les temps et
 * sessions des autres postes restent sur le poste, comme le reste.
 */
export function resetCloud(s: PersistedState): void {
  const c = s.cloud;
  c.cursor = 0;
  c.merged = false;
  c.dirty = [];
  c.timeSent = {};
  c.sessionCursor = 0;
  for (const x of s.sessions) if (!x.deviceId) delete x.sent;
}
