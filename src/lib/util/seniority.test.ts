import { describe, expect, it } from 'vitest';
import { addMonths, durationLabel, seniority, tierAge, TIERS } from './seniority';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe('ancienneté', () => {
  it('ajoute des mois de calendrier sans déborder', () => {
    expect(new Date(addMonths(at(2026, 1, 31), 1)).getDate()).toBe(28);
    expect(addMonths(at(2026, 11, 16), 12)).toBe(at(2027, 11, 16));
  });

  it('donne le bronze dès l\'inscription, puis les paliers suivants', () => {
    const since = at(2026, 11, 16);
    expect(seniority(since, since).tier.id).toBe('bronze');
    expect(seniority(since, at(2026, 12, 15)).tier.id).toBe('bronze');
    expect(seniority(since, at(2026, 12, 16)).tier.id).toBe('argent');
    expect(seniority(since, at(2027, 11, 16)).tier.id).toBe('platine');
    const last = seniority(since, at(2040, 1, 1));
    expect(last.tier.id).toBe('opale');
    expect(last.next).toBeNull();
    expect(last.progress).toBe(1);
  });

  it('mesure l\'avancée vers le palier suivant', () => {
    const since = at(2026, 11, 16);
    const s = seniority(since, at(2026, 12, 1));
    expect(s.next?.id).toBe('argent');
    expect(s.nextAt).toBe(at(2026, 12, 16));
    expect(s.progress).toBeGreaterThan(0.4);
    expect(s.progress).toBeLessThan(0.6);
  });

  it('écrit les durées en français', () => {
    const since = at(2026, 11, 16);
    expect(durationLabel(since, since)).toBe("aujourd'hui");
    expect(durationLabel(since, at(2026, 11, 17))).toBe('1 jour');
    expect(durationLabel(since, at(2027, 1, 28))).toBe('2 mois et 12 jours');
    expect(durationLabel(since, at(2028, 1, 20))).toBe('1 an et 2 mois');
    expect(TIERS.map(tierAge)).toEqual(["Dès l'inscription", '1 mois', '6 mois', '1 an', '2 ans', '3 ans', '5 ans', '6 ans']);
  });
});
