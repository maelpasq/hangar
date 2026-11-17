import { describe, expect, it } from 'vitest';
import type { Game } from '../types';
import { defaultState, normalizeState } from './state';
import {
  httpsLink,
  installChoices,
  installLink,
  linkDomain,
  officialSiteToFind,
  portableId,
  portableOf,
  signature,
  socialInstallChoices,
  stampChanges,
  steamIdFromPortable,
  storePageOf,
  syncEntries,
  wikidataKey
} from './sync';

describe("installer un jeu vu chez un ami", () => {
  it('propose le site officiel, Wikidata et la page Steam, un par domaine', () => {
    const s = defaultState();
    s.officialSites[620] = 'https://www.thinkwithportals.com/';
    s.officialSites[wikidataKey('Portal 2')] = 'https://thinkwithportals.com/fr';
    expect(socialInstallChoices(s, 'Portal 2', 620)).toEqual({
      sites: ['https://www.thinkwithportals.com/'],
      steam: 'https://store.steampowered.com/app/620'
    });
    expect(socialInstallChoices(s, 'Inconnu', null)).toEqual({ sites: [], steam: null });
  });

  it("lit l'appid et le launcher depuis l'identifiant", () => {
    expect(steamIdFromPortable('steam:620')).toBe(620);
    expect(steamIdFromPortable('epic:fn')).toBeNull();
    expect(storePageOf('steam:620', false)).toBe('steam');
    expect(storePageOf('gog:1207658924', false)).toBe('gog');
    expect(storePageOf('battlenet:Pro', false)).toBe('battlenet');
    expect(storePageOf('xbox:Microsoft.624F8B84B80_8wekyb3d8bbwe', true)).toBe('xbox');
    expect(storePageOf('xbox:Microsoft.624F8B84B80_8wekyb3d8bbwe', false)).toBeNull();
    expect(storePageOf('steam:620/../x', true)).toBeNull();
    expect(storePageOf('epic:fn', true)).toBe('epic');
    expect(storePageOf('epic:fn', false)).toBeNull();
    expect(storePageOf('ubisoft:635', true)).toBe('ubisoft');
    expect(storePageOf('ubisoft:1&x', true)).toBeNull();
    expect(storePageOf('riot:valorant', true)).toBe('riot');
    expect(storePageOf('ea:fifa', true)).toBe('ea');
    expect(storePageOf('rockstar:gta5', true)).toBe('rockstar');
    expect(storePageOf('local:x', true)).toBeNull();
    expect(storePageOf('@celeste.exe|celeste', true)).toBeNull();
  });
});

const local = (over: Partial<Game> = {}): Game => ({
  id: 'local:d:\\jeux\\celeste',
  name: 'Celeste',
  store: 'local',
  installDir: 'D:\\Jeux\\Celeste',
  launch: { kind: 'exe', target: 'D:\\Jeux\\Celeste\\Celeste.exe', args: '' },
  launcherName: "l'exécutable du jeu",
  exePath: 'D:\\Jeux\\Celeste\\Celeste.exe',
  processNames: [],
  ...over
});

describe('lien d\'installation', () => {
  it('ne garde que les liens https', () => {
    expect(httpsLink(' https://www.celestegame.com/ ')).toBe('https://www.celestegame.com/');
    for (const bad of ['http://example.org', 'steam://run/1', 'https://', 'https://localhost', 'https://a@b.c', 'https://ex ample.org', 'C:\\jeu.exe']) {
      expect(httpsLink(bad), bad).toBeNull();
    }
    expect(linkDomain('https://www.CelesteGame.com/acheter?x=1')).toBe('celestegame.com');
  });

  it('choix de l\'utilisateur, puis scan, puis page Steam', () => {
    const s = defaultState();
    const g = local();
    expect(installLink(s, g)).toBeNull();
    s.steamIdCache[g.id] = 504230;
    expect(installLink(s, g)).toBe('https://store.steampowered.com/app/504230');
    expect(installLink(s, local({ installUrl: 'https://www.celestegame.com/' }))).toBe('https://www.celestegame.com/');
    s.installLinks[g.id] = 'https://example.org/celeste';
    expect(installLink(s, g)).toBe('https://example.org/celeste');
    s.installLinks[g.id] = '';
    expect(installLink(s, g)).toBeNull();
    expect(installLink(s, { ...g, id: 'steam:504230', store: 'steam' })).toBeNull();
  });

  it('site officiel de la fiche Steam avant la page Steam, à chercher une seule fois', () => {
    const s = defaultState();
    const g = local({ steamAppId: 504230 });
    expect(officialSiteToFind(s, g)).toBe(504230);
    s.officialSites['504230'] = '';
    expect(officialSiteToFind(s, g)).toBeNull();
    expect(installLink(s, g)).toBe('https://store.steampowered.com/app/504230');
    s.officialSites['504230'] = 'https://www.celestegame.com';
    expect(installLink(s, g)).toBe('https://www.celestegame.com');
    // Lien trouvé au scan : rien à chercher.
    expect(officialSiteToFind(defaultState(), local({ steamAppId: 504230, installUrl: 'https://exok.com/' }))).toBeNull();
  });

  it('popup Installer : sites officiels, page Steam à part', () => {
    const s = defaultState();
    const pid = '@lunarclient.exe|lunar client';
    s.portable[pid] = { name: 'Lunar Client', exe: 'lunarclient.exe', dir: 'lunar client' };
    const ghost = { ...local(), id: pid, name: 'Lunar Client', store: 'manual' as const, elsewhere: true, notInstalled: true };
    expect(installChoices(s, ghost, ['Lunar Client'])).toEqual({ sites: [], steam: null });
    s.officialSites[wikidataKey(' Lunar  CLIENT ')] = 'https://www.lunarclient.com/';
    expect(installChoices(s, ghost, ['Lunar Client'])).toEqual({ sites: ['https://www.lunarclient.com/'], steam: null });
    // Lien de l'autre PC (page Steam) : rangé à part ; site de la fiche Steam en tête, un par domaine.
    s.portable[pid] = { ...s.portable[pid], steamAppId: 7, installUrl: 'https://store.steampowered.com/app/7' };
    s.officialSites['7'] = 'https://lunarclient.com/download';
    expect(installChoices(s, ghost, ['Lunar Client'])).toEqual({
      sites: ['https://lunarclient.com/download'],
      steam: 'https://store.steampowered.com/app/7'
    });
  });
});

describe('fiche portable', () => {
  it('signe un jeu local ou manuel par son exécutable et son dossier', () => {
    expect(signature(local())).toEqual({ exe: 'celeste.exe', dir: 'celeste' });
    expect(signature(local({ id: 'manual:/home/a/jeux/celeste/celeste', exePath: null, installDir: '/home/a/Jeux/Celeste/', launch: { kind: 'exe', target: '/home/a/Jeux/Celeste/Celeste', args: '' } }))).toEqual({
      exe: 'celeste',
      dir: 'celeste'
    });
    expect(signature(local({ id: 'steam:1' }))).toBeNull();
  });

  it('donne le même identifiant sur deux postes', () => {
    const a = defaultState();
    const b = defaultState();
    const ga = local();
    const gb = local({ id: 'local:e:\\games\\celeste', installDir: 'E:\\Games\\Celeste', exePath: 'E:\\Games\\Celeste\\Celeste.exe' });
    a.portable[ga.id] = portableOf(a, ga)!;
    b.portable[gb.id] = portableOf(b, gb)!;
    expect(portableId(a, ga.id)).toBe('@celeste.exe|celeste');
    expect(portableId(b, gb.id)).toBe(portableId(a, ga.id));
    expect(portableId(a, 'steam:1')).toBe('steam:1');
    expect(portableId(a, 'local:inconnu')).toBeNull();
  });
});

describe('éléments synchronisables', () => {
  it('laisse sur le poste ce qui est propre à la machine', () => {
    const s = defaultState();
    const g = local();
    s.portable[g.id] = portableOf(s, g)!;
    s.favorites = ['steam:1', g.id, 'local:sans-fiche'];
    s.customCovers = { 'steam:1': 'steam:2', 'steam:3': 'C:\\images\\a.png', 'steam:4': 'none' };
    s.localFolders = ['D:\\Jeux'];
    s.collections = [{ id: 'c1', name: 'À finir', games: [g.id, 'steam:1', 'local:sans-fiche'] }];
    const e = syncEntries(s);
    expect([...e.keys()].filter((k) => k.startsWith('fav:'))).toEqual(['fav:steam:1', 'fav:@celeste.exe|celeste']);
    expect([...e.keys()].filter((k) => k.startsWith('cover:'))).toEqual(['cover:steam:1', 'cover:steam:4']);
    expect(JSON.parse(e.get('collection:c1')!)).toEqual({ name: 'À finir', games: ['@celeste.exe|celeste', 'steam:1'] });
    expect(e.has('pref:startPage')).toBe(true);
    expect(e.has('pref:closeAction')).toBe(false);
    expect([...e.values()].join()).not.toContain('Jeux');
  });

  it('date les ajouts, les modifications et les suppressions', () => {
    const s = defaultState();
    s.favorites = ['steam:1'];
    let prev = stampChanges(s, null, 100);
    expect(s.stamps['fav:steam:1']).toBe(100);
    expect(s.stamps['set:accent']).toBe(100);

    s.accent = '#ff0000';
    prev = stampChanges(s, prev, 200);
    expect(s.stamps['set:accent']).toBe(200);
    expect(s.stamps['fav:steam:1']).toBe(100);

    s.favorites = [];
    prev = stampChanges(s, prev, 300);
    expect(s.stamps['fav:steam:1']).toBe(300);
    expect(prev.has('fav:steam:1')).toBe(false);

    // Rechargement : les dates sont gardées, suppression comprise.
    const again = normalizeState(JSON.parse(JSON.stringify(s)));
    stampChanges(again, null, 400);
    expect(again.stamps['fav:steam:1']).toBe(300);
    expect(again.stamps['set:accent']).toBe(200);
  });
});

describe('migration de la version 1 vers la 2', () => {
  it('garde les données, crée l\'identifiant du poste et date tout au premier passage', () => {
    const v1 = { version: 1, favorites: ['steam:1'], renames: { 'steam:1': 'Mon jeu' }, accent: '#112233', prefs: { startPage: 'library' } };
    const s = normalizeState(v1);
    expect(s.version).toBe(2);
    expect(s.deviceId).toMatch(/^[0-9a-f]{32}$/);
    expect(s.favorites).toEqual(['steam:1']);
    expect(s.stamps).toEqual({});
    stampChanges(s, null, 500);
    expect(s.stamps['fav:steam:1']).toBe(500);
    expect(s.stamps['rename:steam:1']).toBe(500);
    expect(s.stamps['pref:startPage']).toBe(500);
    // L'identifiant ne change plus une fois enregistré.
    expect(normalizeState(JSON.parse(JSON.stringify(s))).deviceId).toBe(s.deviceId);
  });

  it('écarte les fiches et les liens invalides', () => {
    const s = normalizeState({
      version: 2,
      deviceId: 'pas un identifiant',
      portable: { 'local:a': { name: 'A', exe: 'A.EXE', dir: 'A', installUrl: 'http://a.example' }, 'local:b': { name: 'B' } },
      installLinks: { 'local:a': 'https://a.example/jeu', 'local:b': 'javascript:alert(1)', 'local:c': '' }
    });
    expect(s.deviceId).toMatch(/^[0-9a-f]{32}$/);
    expect(s.portable).toEqual({ 'local:a': { name: 'A', exe: 'a.exe', dir: 'a' } });
    expect(s.installLinks).toEqual({ 'local:a': 'https://a.example/jeu', 'local:c': '' });
  });
});
