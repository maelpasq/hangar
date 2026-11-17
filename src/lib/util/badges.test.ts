import { describe, expect, it } from 'vitest';
import { PIONEER_END, badgeViews } from './badges';

const H = 3_600_000;
const ids = (p: Parameters<typeof badgeViews>[0]) => badgeViews(p).map((b) => b.id);

describe('badges du profil', () => {
  it('garde l\'ordre : donnés, pionnier, collection, temps de jeu, launchers', () => {
    const all = badgeViews({ badges: ['chasseur', 'certifie'], since: PIONEER_END - 1, games: 260, playMs: 520 * H, stores: 6 });
    expect(all.map((b) => b.id)).toEqual(['certifie', 'chasseur', 'pionnier', 'collection', 'marathon', 'multi']);
    expect(all[3].label).toBe('Collectionneur : 250 jeux et plus');
    expect(all[4].label).toBe('Marathonien : 500 heures de jeu et plus');
  });

  it('pionnier seulement avant le 1er décembre 2026', () => {
    expect(ids({ since: PIONEER_END - 1 })).toEqual(['pionnier']);
    expect(ids({ since: PIONEER_END })).toEqual([]);
  });

  it('rien sous le premier palier ni quand le profil cache ses données', () => {
    expect(ids({ games: 49, playMs: 99 * H, stores: 4 })).toEqual([]);
    expect(ids({ games: null, playMs: null, stores: null })).toEqual([]);
    expect(ids({})).toEqual([]);
  });
});
