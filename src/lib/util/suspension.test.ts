import { describe, expect, it } from 'vitest';
import { suspensionEnd, suspensionText } from './suspension';

describe('suspension', () => {
  it('dit la fin, ou que la sanction est définitive', () => {
    expect(suspensionEnd({ kind: 'total', reason: '', until: null })).toBe('définitivement');
    expect(suspensionEnd({ kind: 'social', reason: '', until: new Date(2026, 10, 24, 12).getTime() })).toBe(
      "jusqu'au 24 novembre 2026"
    );
  });

  it('explique ce qui est coupé, avec le motif', () => {
    const total = suspensionText({ kind: 'total', reason: ' Triche ', until: null });
    expect(total.title).toBe('Compte suspendu');
    expect(total.short).toBe('Suspendu par la modération définitivement.');
    expect(total.body).toContain('exporter');
    expect(total.body).toContain('Motif : Triche');
    const social = suspensionText({ kind: 'social', reason: '', until: null });
    expect(social.title).toBe('Amis désactivés');
    expect(social.body).not.toContain('Motif');
  });
});
