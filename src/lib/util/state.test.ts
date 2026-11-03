import { describe, expect, it } from 'vitest';
import { defaultState, normalizeState } from './state';

describe('état persistant', () => {
  it('valeurs par défaut sur entrée invalide', () => {
    expect(normalizeState(null)).toEqual(defaultState());
    expect(normalizeState('x')).toEqual(defaultState());
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

  it('garde la clé SteamGridDB, sans espaces', () => {
    expect(normalizeState({ version: 1, prefs: { steamGridDbKey: '  abc123 ' } }).prefs.steamGridDbKey).toBe('abc123');
    expect(normalizeState({ version: 1 }).prefs.steamGridDbKey).toBe('');
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
