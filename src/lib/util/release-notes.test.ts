import { describe, expect, it } from 'vitest';
import { RELEASES, boldParts, compareVersions, displayVersion, notesBetween, parseReleases } from './release-notes';

const MD = `# Versions

## Publier
### pas une version
- étape

## Historique

Une entrée par version.

### 1.2.10 - 14 novembre 2026
Accroche de la version.
<!-- vitrine: social -->

#### Nouveautés
- **Onglet** : premier point
  qui continue.
- Deuxième point.

#### Corrections
- Un bug.

### 1.2.9 - 9 novembre 2026
Ancienne entrée d'un seul paragraphe.

### 1.2.2 - 5 novembre 2026
Encore plus ancienne.
`;

describe('notes de version', () => {
  it('compare les numéros', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.9', '1.2.10')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it("lit l'historique seulement", () => {
    const all = parseReleases(MD);
    expect(all.map((r) => r.version)).toEqual(['1.2.10', '1.2.9', '1.2.2']);
    expect(all[0]).toEqual({
      version: '1.2.10',
      date: '14 novembre 2026',
      intro: 'Accroche de la version.',
      sections: [
        { title: 'Nouveautés', items: ['**Onglet** : premier point qui continue.', 'Deuxième point.'] },
        { title: 'Corrections', items: ['Un bug.'] }
      ],
      spotlight: 'social'
    });
    expect(all[1].intro).toBe("Ancienne entrée d'un seul paragraphe.");
    expect(all[1].sections).toEqual([]);
    expect(all[1].spotlight).toBeUndefined();
  });

  it('choisit les versions à montrer', () => {
    const all = parseReleases(MD);
    expect(notesBetween(all, null, '1.2.10').map((r) => r.version)).toEqual(['1.2.10']);
    expect(notesBetween(all, '1.2.2', '1.2.10').map((r) => r.version)).toEqual(['1.2.10', '1.2.9']);
    expect(notesBetween(all, '1.2.9', '1.2.9')).toEqual([]);
    // Correction silencieuse (pas d'entrée) : les Paramètres montrent les dernières notes publiées.
    expect(notesBetween(all, null, '9.9.9').map((r) => r.version)).toEqual(['1.2.10']);
    expect(notesBetween(all, '1.2.9', '1.2.11').map((r) => r.version)).toEqual(['1.2.10']);
    expect(notesBetween(all, '1.2.10', '1.2.11')).toEqual([]);
    expect(notesBetween(all, null, '0.0.1')).toEqual([]);
    // Correctif 1.2.10.1 : les notes de la 1.2.10, sans fenêtre pour qui les a déjà vues.
    expect(notesBetween(all, null, '1.2.10.1').map((r) => r.version)).toEqual(['1.2.10']);
    expect(notesBetween(all, '1.2.9', '1.2.10.1').map((r) => r.version)).toEqual(['1.2.10']);
    expect(notesBetween(all, '1.2.10', '1.2.10.1')).toEqual([]);
    expect(notesBetween(all, '1.2.10.1', '1.2.10.2')).toEqual([]);
  });

  it('découpe le gras sans HTML', () => {
    expect(boldParts('**Mode manette** : <b>x</b>')).toEqual([
      { text: 'Mode manette', bold: true },
      { text: ' : <b>x</b>', bold: false }
    ]);
  });

  it('lit le vrai docs/RELEASES.md', () => {
    expect(RELEASES.length).toBeGreaterThan(10);
    expect(RELEASES[0].intro).not.toBe('');
  });

  it('montre un correctif avec un 4e chiffre', () => {
    expect(displayVersion('1.2.27+1')).toBe('1.2.27.1');
    expect(displayVersion('1.2.27')).toBe('1.2.27');
    expect(compareVersions('1.2.27.1', '1.2.27')).toBeGreaterThan(0);
    expect(compareVersions('1.2.28', '1.2.27.3')).toBeGreaterThan(0);
  });
});
