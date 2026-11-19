import { describe, expect, it } from 'vitest';
import { AUTO_BADGES, PIONEER_END, badgeViews } from './badges';

const H = 3_600_000;
const ids = (p: Parameters<typeof badgeViews>[0]) => badgeViews(p).map((b) => b.id);

describe('badges du profil', () => {
  it('garde l\'ordre : donnés, pionnier, collection, temps de jeu, launchers', () => {
    const all = badgeViews({ badges: ['chasseur', 'certifie'], since: PIONEER_END - 1, games: 260, playMs: 520 * H, stores: 6 });
    expect(all.map((b) => b.id)).toEqual(['certifie', 'chasseur', 'pionnier', 'collection', 'marathon', 'multi']);
    expect(all[3].label).toBe('Collectionneur : 250 jeux et plus');
    expect(all[4].label).toBe('Marathonien : 500 heures de jeu et plus');
  });

  it('affiche les badges créés dans le dashboard, avant les badges calculés', () => {
    const all = badgeViews({
      badges: ['certifie'],
      badgeDefs: [
        { id: 'certifie', name: 'Compte certifié', description: '', icon: 'seal', color: 'accent' },
        { id: 'fan', name: 'Fan', description: '', icon: 'heart', color: '#F2556B' },
        { id: 'futur', name: 'Futur', description: '', icon: 'licorne', color: 'n importe' }
      ],
      since: PIONEER_END - 1
    });
    expect(all.map((b) => [b.id, b.label, b.icon, b.color])).toEqual([
      ['certifie', 'Compte certifié', 'seal', 'var(--accent)'],
      ['fan', 'Fan', 'heart', '#F2556B'],
      // Emblème qu'une version plus récente connaît : l'étoile.
      ['futur', 'Futur', 'star', 'var(--accent)'],
      ['pionnier', 'Pionnier : sur Hangar avant décembre 2026', 'flag', '#f08a3c']
    ]);
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

describe('AUTO_BADGES', () => {
  it('décrit chaque badge calculé, dans l’ordre d’affichage', () => {
    const p = { since: 1, games: 500, playMs: 1000 * 3_600_000, stores: 6 };
    const views = badgeViews(p);
    expect(AUTO_BADGES.map((b) => b.id)).toEqual(views.map((v) => v.id));
    for (const v of views) {
      const a = AUTO_BADGES.find((b) => b.id === v.id)!;
      expect(a.icon).toBe(v.icon);
      expect(a.tiers.at(-1)!.color).toBe(v.color);
    }
  });
});
