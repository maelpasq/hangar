import { describe, expect, it } from 'vitest';
import type { CloudChange, Game } from '../types';
import { ackPushed, adoptGhosts, applyRemote, ghostGames, hasMeaningful, markAllDirty, pendingChanges, replaceWithRemote } from './cloud-sync';
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
