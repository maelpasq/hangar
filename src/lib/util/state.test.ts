import { describe, expect, it } from 'vitest';
import { defaultState, normalizeState } from './state';

describe('état persistant', () => {
  it('valeurs par défaut sur entrée invalide', () => {
    expect(normalizeState(null)).toEqual(defaultState());
    expect(normalizeState('x')).toEqual(defaultState());
  });

  it('jeux web : null tant que non demandé, puis le choix est gardé', () => {
    expect(normalizeState({ version: 1, prefs: {} }).prefs.webGames).toBeNull();
    expect(normalizeState({ version: 1, prefs: { webGames: 'oui' } }).prefs.webGames).toBeNull();
    expect(normalizeState({ version: 1, prefs: { webGames: false } }).prefs.webGames).toBe(false);
    expect(normalizeState({ version: 1, prefs: { webGames: true }, webPlayed: { agar: 5, x: 'y' } })).toMatchObject({
      prefs: { webGames: true },
      webPlayed: { agar: 5 }
    });
  });

  it("assistant : à montrer tant qu'il n'a pas été vu", () => {
    expect(normalizeState({ version: 1, prefs: { webGames: true } }).onboarded).toBe(false);
    expect(normalizeState({ version: 1, onboarded: 'oui' }).onboarded).toBe(false);
    expect(normalizeState({ version: 1, onboarded: true }).onboarded).toBe(true);
    expect(normalizeState({ version: 1, mcLast: '1.8.9' }).mcLast).toBe('1.8.9');
    expect(normalizeState({ version: 1, mcLast: 3 }).mcLast).toBe('');
  });

  it('migre la v1 (recents, launches, coverCache)', () => {
    const s = normalizeState({
      favorites: ['steam:1'],
      recents: { 'steam:1': 1000 },
      launches: { 'steam:1': 4 },
      coverCache: { 'epic:fn': 0, 'gog:1': 292030 },
      sort: 'az'
    });
    expect(s.version).toBe(1);
    expect(s.favorites).toEqual(['steam:1']);
    expect(s.totals['steam:1']).toEqual({ playMs: 0, launches: 4, lastPlayed: 1000 });
    expect(s.steamIdCache).toEqual({ 'epic:fn': 0, 'gog:1': 292030 });
    expect(s.sort).toBe('az');
  });

  it('écarte les sessions de plus de 90 jours et les valeurs corrompues', () => {
    const now = 200 * 86_400_000;
    const s = normalizeState(
      {
        version: 1,
        sessions: [
          { gameId: 'a', start: now - 1000, end: now },
          { gameId: 'b', start: 0, end: 1 },
          { gameId: 3, start: 0, end: 1 }
        ],
        accent: 'rouge',
        disabledStores: ['steam', 'inconnu']
      },
      now
    );
    expect(s.sessions.map((x) => x.gameId)).toEqual(['a']);
    expect(s.accent).toBe('#7c6cff');
    expect(s.disabledStores).toEqual(['steam']);
  });

  it('garde un thème valide, sombre sinon', () => {
    expect(normalizeState({ version: 1, theme: 'light' }).theme).toBe('light');
    expect(normalizeState({ version: 1, theme: 'bleu' }).theme).toBe('dark');
  });

  it('garde la clé SteamGridDB, sans espaces', () => {
    expect(normalizeState({ version: 1, prefs: { steamGridDbKey: '  abc123 ' } }).prefs.steamGridDbKey).toBe('abc123');
    expect(normalizeState({ version: 1 }).prefs.steamGridDbKey).toBe('');
  });

  it('affiche les jeux non installés par défaut', () => {
    expect(normalizeState({ version: 1, prefs: {} }).prefs.showUninstalled).toBe(true);
    expect(normalizeState({ version: 1, prefs: { showUninstalled: false } }).prefs.showUninstalled).toBe(false);
  });

  it('bureau : zone de notification et raccourci par défaut, Discord coupé', () => {
    const p = normalizeState({ version: 1, prefs: {} }).prefs;
    expect([p.closeToTray, p.globalShortcut, p.discordPresence]).toEqual([true, true, false]);
    expect(normalizeState({ version: 1, prefs: { discordPresence: true } }).prefs.discordPresence).toBe(true);
  });

  it('nettoie les collections', () => {
    const s = normalizeState({
      version: 1,
      collections: [
        { id: 'c1', name: ' À finir ', games: ['steam:1', 'steam:1', 3] },
        { id: 'c1', name: 'Doublon', games: [] },
        { id: 'c2', name: '  ', games: [] },
        'x'
      ]
    });
    expect(s.collections).toEqual([{ id: 'c1', name: 'À finir', games: ['steam:1'] }]);
  });

  it('nettoie les jeux manuels', () => {
    const s = normalizeState({
      version: 1,
      manualGames: [
        { id: 'manual:c:\\a.exe', name: 'A', launch: { kind: 'exe', target: 'C:\\a.exe', args: '-x' } },
        { id: 'x', name: 'Sans cible', launch: {} }
      ]
    });
    expect(s.manualGames).toHaveLength(1);
    expect(s.manualGames[0].store).toBe('manual');
    expect(s.manualGames[0].launch.args).toBe('-x');
  });
});
