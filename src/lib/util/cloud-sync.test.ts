import { describe, expect, it } from 'vitest';
import type { CloudChange, Game } from '../types';
import {
  ackPushed,
  ackSessions,
  ackTimes,
  adoptGhosts,
  applyRemote,
  applyRemoteSessions,
  ghostGames,
  hasMeaningful,
  markAllDirty,
  measuredMs,
  pendingChanges,
  pendingSessions,
  remoteTimes,
  replaceWithRemote,
  resetCloud,
  sessionId,
  timeChanges
} from './cloud-sync';
import { defaultState } from './state';
import { portableOf, stampChanges, syncEntries } from './sync';

const PID = '@celeste.exe|celeste';

const celeste = (over: Partial<Game> = {}): Game => ({
  id: 'local:e:\\autres\\celeste',
  name: 'Celeste',
  store: 'local',
  installDir: 'E:\\Autres\\Celeste',
  launch: { kind: 'exe', target: 'E:\\Autres\\Celeste\\Celeste.exe', args: '' },
  launcherName: "l'exécutable du jeu",
  exePath: 'E:\\Autres\\Celeste\\Celeste.exe',
  processNames: [],
  ...over
});

const ch = (key: string, value: unknown, updatedAt: number): CloudChange => ({
  key,
  value: value === null ? null : JSON.stringify(value),
  updatedAt
});

describe('changements reçus', () => {
  it('le plus récent gagne, élément par élément', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.favorites = ['steam:1'];
    stampChanges(s, null, 100);
    expect(s.cloud.dirty).toContain('fav:steam:1');

    // Plus ancien que la modification d'ici : ignoré, et toujours à envoyer.
    applyRemote(s, [ch('fav:steam:1', null, 50)]);
    expect(s.favorites).toEqual(['steam:1']);
    expect(s.cloud.dirty).toContain('fav:steam:1');

    // Plus récent : appliqué, plus rien à envoyer pour lui.
    applyRemote(s, [ch('fav:steam:1', null, 200), ch('rename:steam:2', 'Mon jeu', 200), ch('set:accent', '#ff0000', 200)]);
    expect(s.favorites).toEqual([]);
    expect(s.renames['steam:2']).toBe('Mon jeu');
    expect(s.accent).toBe('#ff0000');
    expect(s.cloud.dirty).not.toContain('fav:steam:1');
    expect(s.stamps['fav:steam:1']).toBe(200);
  });

  it('refuse les valeurs invalides et garde les jaquettes en fichier local', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.customCovers['steam:3'] = 'C:\\images\\a.png';
    applyRemote(s, [
      ch('set:accent', 'rouge', 10),
      ch('set:theme', 'violet', 10),
      ch('pref:autoCovers', 'oui', 10),
      ch('cover:steam:3', 'steam:42', 10),
      ch('cover:steam:4', 'C:\\x.png', 10),
      ch('inconnu:x', 1, 10)
    ]);
    expect(s.accent).toBe('#7c6cff');
    expect(s.theme).toBe('dark');
    expect(s.prefs.autoCovers).toBe(true);
    expect(s.customCovers['steam:3']).toBe('C:\\images\\a.png');
    expect(s.customCovers['steam:4']).toBeUndefined();
  });

  it('date d\'ajout : la plus ancienne gagne et repart vers le compte', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.firstSeen['steam:1'] = 1000;
    s.firstSeen['steam:2'] = 5000;
    stampChanges(s, null, 10);
    s.cloud.dirty = [];
    applyRemote(s, [ch('seen:steam:1', 3000, 20), ch('seen:steam:2', 2000, 20)], 99);
    expect(s.firstSeen['steam:1']).toBe(1000);
    expect(s.cloud.dirty).toEqual(['seen:steam:1']);
    expect(s.stamps['seen:steam:1']).toBe(99);
    expect(s.firstSeen['steam:2']).toBe(2000);
  });

  it('collections : jeux du compte reliés aux jeux de ce poste', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.portable['local:e:\\autres\\celeste'] = portableOf(s, celeste())!;
    applyRemote(s, [ch('collection:c1', { name: 'À finir', games: [PID, 'steam:9', '@autre.exe|autre'] }, 10)]);
    expect(s.collections).toEqual([{ id: 'c1', name: 'À finir', games: ['local:e:\\autres\\celeste', 'steam:9', '@autre.exe|autre'] }]);
    // Et retour identique vers le compte.
    expect(syncEntries(s).get('collection:c1')).toBe(JSON.stringify({ name: 'À finir', games: [PID, 'steam:9', '@autre.exe|autre'] }));
    applyRemote(s, [ch('collection:c1', null, 20)]);
    expect(s.collections).toEqual([]);
  });
});

describe('jeux sur un autre PC', () => {
  it('carte en gris, puis rattachement quand le scan le trouve ailleurs', () => {
    const s = defaultState();
    s.cloud.merged = true;
    applyRemote(s, [
      ch(`game:${PID}`, { name: 'Celeste', steamAppId: 504230, installUrl: 'https://www.celestegame.com/' }, 10),
      ch(`fav:${PID}`, true, 10),
      ch(`rename:${PID}`, 'Celeste (PC salon)', 10)
    ]);
    const [ghost] = ghostGames(s);
    expect(ghost).toMatchObject({ id: PID, name: 'Celeste', elsewhere: true, notInstalled: true, steamAppId: 504230, installUrl: 'https://www.celestegame.com/' });
    expect(s.favorites).toEqual([PID]);
    // Les clés envoyées restent celles du compte.
    expect(syncEntries(s).get(`fav:${PID}`)).toBe('true');
    expect(syncEntries(s).has(`game:${PID}`)).toBe(true);

    // Le scan trouve Celeste sur un autre disque : même signature.
    const g = celeste();
    s.portable[g.id] = portableOf(s, g)!;
    expect(adoptGhosts(s)).toBe(true);
    expect(ghostGames(s)).toEqual([]);
    expect(s.favorites).toEqual([g.id]);
    expect(s.renames[g.id]).toBe('Celeste (PC salon)');
    expect(s.portable[PID]).toBeUndefined();
    expect(syncEntries(s).get(`fav:${PID}`)).toBe('true');
  });

  it('jeu installé ici : sa fiche n\'est jamais retirée par le compte', () => {
    const s = defaultState();
    s.cloud.merged = true;
    const g = celeste();
    s.portable[g.id] = portableOf(s, g)!;
    applyRemote(s, [ch(`game:${PID}`, null, 10)], 50);
    expect(s.portable[g.id]).toBeDefined();
    expect(s.cloud.dirty).toContain(`game:${PID}`);
  });

  it('« J\'ai déjà ce jeu » : le jeu choisi garde la signature du compte', () => {
    const s = defaultState();
    s.cloud.merged = true;
    applyRemote(s, [ch(`game:${PID}`, { name: 'Celeste' }, 10), ch(`fav:${PID}`, true, 10)]);
    const g = celeste({ id: 'manual:d:\\c\\celeste_v2.exe', installDir: 'D:\\C', exePath: 'D:\\C\\Celeste_v2.exe', store: 'manual' });
    s.cloud.aliases[g.id] = { exe: 'celeste.exe', dir: 'celeste' };
    s.portable[g.id] = portableOf(s, g)!;
    adoptGhosts(s);
    expect(s.favorites).toEqual([g.id]);
    expect(ghostGames(s)).toEqual([]);
  });
});

describe('envoi et première connexion', () => {
  it('file d\'envoi : valeurs courantes, suppressions, acquittement', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.favorites = ['steam:1'];
    const prev = stampChanges(s, null, 10);
    s.favorites = [];
    s.renames['steam:2'] = 'B';
    stampChanges(s, prev, 20);
    const batch = pendingChanges(s);
    expect(batch).toContainEqual({ key: 'fav:steam:1', value: null, updatedAt: 20 });
    expect(batch).toContainEqual({ key: 'rename:steam:2', value: '"B"', updatedAt: 20 });
    // Modifié pendant l'envoi : reste dans la file.
    s.stamps['rename:steam:2'] = 30;
    ackPushed(s, batch);
    expect(s.cloud.dirty).toEqual(['rename:steam:2']);
  });

  it('écarte un élément trop gros pour l\'API', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.renames['steam:1'] = 'x'.repeat(20_000);
    stampChanges(s, null, 10);
    expect(pendingChanges(s).some((c) => c.key === 'rename:steam:1')).toBe(false);
    expect(s.cloud.dirty).not.toContain('rename:steam:1');
  });

  it('fusionner : le plus récent gagne, tout le reste part', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.favorites = ['steam:1'];
    s.accent = '#00ff00';
    stampChanges(s, null, 100);
    s.cloud.dirty = [];
    markAllDirty(s);
    applyRemote(s, [ch('fav:steam:2', true, 50), ch('set:accent', '#ff0000', 50)]);
    expect(s.favorites).toEqual(['steam:1', 'steam:2']);
    expect(s.accent).toBe('#00ff00');
    expect(s.cloud.dirty).toContain('fav:steam:1');
    expect(s.cloud.dirty).toContain('set:accent');
    expect(s.cloud.dirty).not.toContain('fav:steam:2');
  });

  it('utiliser le compte : la partie synchronisée de ce poste est remplacée', () => {
    const s = defaultState();
    s.cloud.merged = true;
    s.favorites = ['steam:1'];
    s.collections = [{ id: 'c0', name: 'Ici', games: [] }];
    s.firstSeen['steam:1'] = 5;
    stampChanges(s, null, 100);
    replaceWithRemote(s, [ch('fav:steam:2', true, 50), ch('set:theme', 'light', 50)], 200);
    expect(s.favorites).toEqual(['steam:2']);
    expect(s.collections).toEqual([]);
    expect(s.theme).toBe('light');
    // Ce que le compte n'a pas (date d'ajout, autres réglages) lui est envoyé.
    expect(s.cloud.dirty).toContain('seen:steam:1');
    expect(s.cloud.dirty).toContain('set:accent');
    expect(s.cloud.dirty).not.toContain('fav:steam:2');
    expect(s.cloud.dirty).not.toContain('set:theme');
  });

  it('bibliothèque personnalisée ou non', () => {
    expect(hasMeaningful(['seen:steam:1', 'set:accent', 'pref:autoCovers'])).toBe(false);
    expect(hasMeaningful(['seen:steam:1', 'collection:c1'])).toBe(true);
  });
});

describe('temps de jeu cumulé', () => {
  const OTHER = 'b'.repeat(32);

  it("garde le temps des autres postes, jamais le sien ni dans la file d'envoi", () => {
    const s = defaultState();
    s.cloud.merged = true;
    const changed = applyRemote(s, [
      ch(`time:${OTHER}:epic:fortnite`, { ms: 3_600_000, n: 4, last: 50 }, 100),
      ch(`time:${s.deviceId}:epic:fortnite`, { ms: 99, n: 1, last: 1 }, 100),
      ch('time:pas-un-poste:epic:fortnite', { ms: 99, n: 1, last: 1 }, 100)
    ]);
    expect(changed).toBe(true);
    expect(s.cloud.times).toEqual({
      [OTHER]: { 'epic:fortnite': { playMs: 3_600_000, launches: 4, lastPlayed: 50, store: false, at: 100 } }
    });
    expect(remoteTimes(s, 'epic:fortnite')).toHaveLength(1);
    expect(Object.keys(s.stamps).some((k) => k.startsWith('time:'))).toBe(false);
    markAllDirty(s);
    expect(pendingChanges(s).some((c) => c.key.startsWith('time:'))).toBe(false);
    // Plus ancien : ignoré ; supprimé : retiré.
    applyRemote(s, [ch(`time:${OTHER}:epic:fortnite`, { ms: 1, n: 1, last: 1 }, 50)]);
    expect(s.cloud.times[OTHER]['epic:fortnite'].playMs).toBe(3_600_000);
    applyRemote(s, [ch(`time:${OTHER}:epic:fortnite`, null, 200)]);
    expect(s.cloud.times[OTHER]['epic:fortnite']).toBeUndefined();
  });

  it('« Utiliser le compte » garde aussi le temps des autres postes', () => {
    const s = defaultState();
    replaceWithRemote(s, [ch(`time:${OTHER}:epic:fortnite`, { ms: 10, n: 1, last: 5, s: 1 }, 100)]);
    expect(s.cloud.times[OTHER]['epic:fortnite'].store).toBe(true);
    expect(s.stamps[`time:${OTHER}:epic:fortnite`]).toBeUndefined();
  });

  it("n'envoie que les temps de ce poste qui ont changé", () => {
    const s = defaultState();
    s.totals['epic:fortnite'] = { playMs: 7_200_000, launches: 3, lastPlayed: 10 };
    s.totals['steam:620'] = { playMs: 0, launches: 0, lastPlayed: 0 };
    const first = timeChanges(s, () => false, 500);
    expect(first).toEqual([
      { key: `time:${s.deviceId}:epic:fortnite`, value: JSON.stringify({ ms: 7_200_000, n: 3, last: 10, h: 7_200_000 }), updatedAt: 500 }
    ]);
    ackTimes(s, first);
    expect(timeChanges(s, () => false)).toEqual([]);
    s.totals['epic:fortnite'].playMs += 60_000;
    expect(timeChanges(s, () => true)[0].value).toContain('"s":1');
  });

  it('sépare le temps mesuré par Hangar des heures du store', () => {
    const s = defaultState();
    // Heures de Steam reprises : seul le temps des sessions de ce poste a été mesuré par Hangar.
    s.totals['steam:620'] = { playMs: 100 * 3_600_000, launches: 2, lastPlayed: 10 };
    s.sessions = [
      { gameId: 'steam:620', start: 0, end: 1_800_000 },
      { gameId: 'steam:620', start: 0, end: 9_000_000, deviceId: OTHER }
    ];
    expect(measuredMs(s, 'steam:620', true)).toBe(1_800_000);
    // Jeu sans store : tout son temps vient de Hangar.
    s.totals['manual:jeu'] = { playMs: 600_000, launches: 1, lastPlayed: 10 };
    expect(measuredMs(s, 'manual:jeu', false)).toBe(600_000);
    // Une fois suivi, le compteur fait foi.
    s.totals['steam:620'].hangarMs = 42;
    expect(measuredMs(s, 'steam:620', true)).toBe(42);
    expect(JSON.parse(timeChanges(s, (id) => id === 'steam:620').find((c) => c.key.endsWith('steam:620'))?.value ?? '')).toMatchObject({ s: 1, h: 42 });
  });

  it('les sessions finies partent une fois, avec un identifiant stable', () => {
    const s = defaultState();
    const now = 10_000_000;
    s.sessions = [
      { gameId: 'epic:fortnite', start: 1000, end: 2000 },
      { gameId: 'epic:fortnite', start: now - 60_000, end: now },
      { gameId: 'epic:fortnite', start: now - 30_000, end: now - 1000, done: true },
      { gameId: 'riot:valorant', start: 10, end: 20, deviceId: OTHER, id: 'x' }
    ];
    const list = pendingSessions(s, now);
    expect(list.map((x) => x.start)).toEqual([1000, now - 30_000]);
    expect(list[0].id).toBe(sessionId(s.deviceId, 'epic:fortnite', 1000));
    expect(list[0].id.length).toBeLessThanOrEqual(64);
    ackSessions(s, list);
    expect(pendingSessions(s, now)).toEqual([]);
    resetCloud(s);
    expect(pendingSessions(s, now)).toHaveLength(2);
  });

  it('reprend les sessions des autres postes, sans doublon', () => {
    const s = defaultState();
    const now = Date.now();
    const list = [
      { id: 'a1', gameId: PID, start: now - 7_200_000, end: now - 3_600_000, deviceId: OTHER },
      { id: 'a1', gameId: PID, start: now - 7_200_000, end: now - 3_600_000, deviceId: OTHER },
      { id: 'mine', gameId: PID, start: now - 7_200_000, end: now, deviceId: s.deviceId },
      { id: 'old', gameId: PID, start: 0, end: 1, deviceId: OTHER }
    ];
    expect(applyRemoteSessions(s, list, now)).toBe(true);
    expect(applyRemoteSessions(s, list, now)).toBe(false);
    expect(s.sessions).toEqual([{ gameId: PID, start: now - 7_200_000, end: now - 3_600_000, deviceId: OTHER, id: 'a1' }]);
    // Le jeu est retrouvé sur ce poste : ses sessions le suivent.
    const g = celeste();
    s.portable[g.id] = portableOf(s, g)!;
    s.portable[PID] = { name: 'Celeste', exe: 'celeste.exe', dir: 'celeste' };
    adoptGhosts(s);
    expect(s.sessions[0].gameId).toBe(g.id);
  });
});
