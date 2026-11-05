import { describe, expect, it } from 'vitest';
import { generatedBackground, hue } from './color';
import { daysAgo, elapsed, hoursLabel, relativeDay, sizeLabel } from './format';
import { matches, normalize, rank } from './search';
import { dedupe } from './games';
import { pressed } from './pad';
import type { Game } from '../types';

describe('couleur', () => {
  it('hash stable', () => {
    expect(hue('satisfactory')).toBe(hue('satisfactory'));
    expect(hue('satisfactory')).toBeGreaterThanOrEqual(0);
    expect(hue('satisfactory')).toBeLessThan(360);
    expect(hue('a')).not.toBe(hue('b'));
  });
  it('dégradé à 160 degrés', () => {
    expect(generatedBackground('x')).toMatch(/^linear-gradient\(160deg, hsl\(/);
  });
});

describe('dates relatives', () => {
  const now = new Date(2026, 10, 3, 15, 0).getTime();
  it("aujourd'hui", () => {
    expect(relativeDay(new Date(2026, 10, 3, 0, 5).getTime(), now)).toBe("Aujourd'hui");
  });
  it('hier, même à 23 h', () => {
    expect(relativeDay(new Date(2026, 10, 2, 23, 59).getTime(), now)).toBe('Hier');
  });
  it('il y a N jours', () => {
    expect(relativeDay(new Date(2026, 9, 27, 12).getTime(), now)).toBe('Il y a 7 jours');
    expect(daysAgo(new Date(2026, 9, 27, 12).getTime(), now)).toBe(7);
  });
});

describe('durées', () => {
  it('heures', () => {
    expect(hoursLabel(0)).toBe('0 h');
    expect(hoursLabel(45 * 60_000)).toBe('45 min');
    expect(hoursLabel(214 * 3_600_000)).toBe('214 h');
    expect(hoursLabel(1234 * 3_600_000).replace(/\s/g, ' ')).toBe('1 234 h');
  });
  it('chronomètre', () => {
    expect(elapsed(0)).toBe('00:00');
    expect(elapsed(83_000)).toBe('01:23');
    expect(elapsed(3_723_000)).toBe('1:02:03');
  });
  it('tailles', () => {
    expect(sizeLabel(450_000_000)).toBe('450 Mo');
    expect(sizeLabel(1_400_000_000)).toBe('1,4 Go');
    expect(sizeLabel(23_000_000_000)).toBe('23 Go');
    expect(sizeLabel(null)).toBe('-');
  });
});

describe('recherche', () => {
  it('ignore accents et casse', () => {
    expect(normalize('Élden Rïng™')).toBe('elden ring');
    expect(matches('ELDEN RING', 'élden')).toBe(true);
    expect(matches('Pokémon', 'POKEMON')).toBe(true);
    expect(matches('Factorio', 'zz')).toBe(false);
    expect(matches('Factorio', '')).toBe(false);
  });
  it('préfixe en premier', () => {
    const r = rank(['Hollow Knight', 'Knights of Pen', 'Kingdom'], 'kn', (s) => s);
    expect(r).toEqual(['Knights of Pen', 'Hollow Knight']);
  });
});

describe('dédoublonnage', () => {
  const g = (id: string, store: Game['store'], dir: string): Game => ({
    id,
    name: id,
    store,
    installDir: dir,
    launch: { kind: 'exe', target: '', args: '' },
    launcherName: '',
    processNames: []
  });
  it('garde la source prioritaire pour un même dossier', () => {
    const out = dedupe([g('local:a', 'local', 'C:\\Jeux\\A\\'), g('steam:1', 'steam', 'c:\\jeux\\a')]);
    expect(out.map((x) => x.id)).toEqual(['steam:1']);
  });
});

describe('manette', () => {
  const pad = (buttons: number[], axes: number[] = [0, 0]) => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), touched: false, value: 0 })),
    axes
  });
  it('boutons et stick gauche, zone morte comprise', () => {
    expect([...pressed(pad([0, 12]))].sort()).toEqual(['a', 'up']);
    expect([...pressed(pad([], [0.9, -0.2]))]).toEqual(['right']);
    expect(pressed(pad([], [0.3, 0.3])).size).toBe(0);
  });
});
