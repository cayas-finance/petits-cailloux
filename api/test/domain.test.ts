import { describe, expect, it } from 'vitest';
import {
  checkCycle,
  checkOwner,
  checkProject,
  cleanFilename,
  currentCycle,
  describeChange,
  cycleEnd,
  isInline,
  nextCycle,
  nextMonday,
  numberCycles,
  pitchTemplate,
  promotedPitch,
  quarterBounds,
  removeAttachmentLinks,
  suggestedStart,
  weekOf,
  weekSummary,
} from '../src/domain';

describe('quarters', () => {
  it('computes the bounds of Q4 2026', () => {
    expect(quarterBounds(2026, 4)).toEqual({ startsOn: '2026-10-01', endsOn: '2026-12-31' });
  });
  it('handles leap years', () => {
    expect(quarterBounds(2028, 1)).toEqual({ startsOn: '2028-01-01', endsOn: '2028-03-31' });
  });
});

describe('cycles', () => {
  const q4 = quarterBounds(2026, 4);
  it('lasts 4 weeks', () => {
    expect(cycleEnd('2026-10-05')).toBe('2026-11-01');
  });
  it('suggests the first Monday of the quarter, then chains cycles', () => {
    expect(nextMonday('2026-10-01')).toBe('2026-10-05');
    expect(suggestedStart(q4, [])).toBe('2026-10-05');
    expect(suggestedStart(q4, [{ id: 'a', startsOn: '2026-10-05', endsOn: '2026-11-01' }])).toBe('2026-11-02');
  });
  it('rejects a cycle outside the quarter, not on a Monday, or overlapping', () => {
    const existing = [{ id: 'a', startsOn: '2026-10-05', endsOn: '2026-11-01' }];
    expect(checkCycle(q4, existing, '2027-01-04')).toMatch(/pendant le trimestre/);
    expect(checkCycle(q4, existing, '2026-11-03')).toMatch(/lundi/);
    expect(checkCycle(q4, existing, '2026-10-26')).toMatch(/chevauche/);
    expect(checkCycle(q4, existing, '2026-11-02')).toBeNull();
  });
  it('allows at most 3 cycles', () => {
    const three = [
      { id: 'a', startsOn: '2026-10-05', endsOn: '2026-11-01' },
      { id: 'b', startsOn: '2026-11-02', endsOn: '2026-11-29' },
      { id: 'c', startsOn: '2026-11-30', endsOn: '2026-12-27' },
    ];
    expect(checkCycle(q4, three, '2026-12-28')).toMatch(/au plus 3/);
    expect(checkCycle(q4, three, '2026-11-30', 'c')).toBeNull();
  });
  it('numbers cycles chronologically', () => {
    expect(numberCycles([{ startsOn: '2026-11-02' }, { startsOn: '2026-10-05' }]).map((c) => c.number + c.startsOn)).toEqual([
      '12026-10-05',
      '22026-11-02',
    ]);
  });
});

describe('projects', () => {
  it('requires a cycle for a bet or shipped project', () => {
    expect(checkProject({ status: 'bet', cycleId: null })).toMatch(/cycle/);
    expect(checkProject({ status: 'shipped', cycleId: null })).toMatch(/cycle/);
    expect(checkProject({ status: 'bet', cycleId: 'c1' })).toBeNull();
    expect(checkProject({ status: 'received', cycleId: null })).toBeNull();
  });
  it('requires a requester for a short topic, and no shaping', () => {
    expect(checkProject({ format: 'short', status: 'received', cycleId: null, requester: 'Nico' })).toBeNull();
    expect(checkProject({ format: 'short', status: 'received', cycleId: null, requester: ' ' })).toMatch(/demandeur/);
    expect(checkProject({ format: 'short', status: 'shaping', cycleId: null, requester: 'Nico' })).toMatch(/pari/);
    expect(checkProject({ format: 'short', status: 'bet', cycleId: null, requester: 'Nico' })).toMatch(/sujet court/);
    expect(checkProject({ format: 'short', status: 'bet', cycleId: 'c1', requester: 'Nico' })).toBeNull();
  });
  it('only accepts an owner from the allowed domain', () => {
    expect(checkOwner('marine@cayas.fr', 'cayas.fr')).toBeNull();
    expect(checkOwner('Marine@Cayas.fr ', 'cayas.fr')).toBeNull();
    expect(checkOwner('marine@gmail.com', 'cayas.fr')).toMatch(/@cayas.fr/);
    expect(checkOwner('marine', 'cayas.fr')).toMatch(/adresse/);
  });
});

describe('pitch', () => {
  it('fills the guide template', () => {
    const t = pitchTemplate('Import des relevés', 'thomas@cayas.fr', '2026-11-13');
    expect(t.startsWith('# Import des relevés\n')).toBe(true);
    expect(t).toContain('Rédigé par : thomas@cayas.fr · Date : 13/11/2026');
    for (const s of ['## Problème', '## Solution esquissée', '## Pièges identifiés', '## Hors périmètre', '## Comment on saura que c’est réussi'])
      expect(t).toContain(s);
  });
  it('does not ask for goals, already set on the project', () => {
    expect(pitchTemplate('X', 'a@cayas.fr', '2026-11-13')).not.toContain('Objectif servi');
  });
  it('keeps the problem when a short topic becomes a bet', () => {
    const t = promotedPitch('Export CSV', 'thomas@cayas.fr', '2026-11-13', 'Les clients ne peuvent pas exporter.');
    expect(t).toContain('## Problème\nLes clients ne peuvent pas exporter.\n');
    expect(t).not.toContain('[Situation vécue');
    expect(promotedPitch('X', 'a@cayas.fr', '2026-11-13', '  ')).toContain('[Situation vécue');
  });
  it('only serves images and PDFs inline', () => {
    expect(isInline('image/png')).toBe(true);
    expect(isInline('application/pdf')).toBe(true);
    expect(isInline('image/svg+xml')).toBe(false);
    expect(isInline('text/html')).toBe(false);
  });
  it('cleans file names', () => {
    expect(cleanFilename('C:\\temp\\maquette "v2".png')).toBe('maquette v2.png');
    expect(cleanFilename('../../etc/passwd')).toBe('passwd');
    expect(cleanFilename('   ')).toBe('fichier');
  });
});

describe('removing an attachment', () => {
  const url = '/api/attachments/abc';
  it('removes an image alone on its line, without leaving an empty line', () => {
    expect(removeAttachmentLinks(`Avant\n![schema.png](${url})\nAprès`, url)).toBe('Avant\nAprès');
  });
  it('removes a link in the middle of a sentence', () => {
    expect(removeAttachmentLinks(`Voir [notes.txt](${url}) ici`, url)).toBe('Voir  ici');
  });
  it('leaves other attachments alone', () => {
    const other = '[b](/api/attachments/abcd)';
    expect(removeAttachmentLinks(`${other}\n[a](${url})`, url)).toBe(`${other}\n`);
  });
});

describe('weekly review', () => {
  const c = { startsOn: '2026-11-02', endsOn: '2026-11-29' };
  it('gives the week of the cycle', () => {
    expect(weekOf(c, '2026-11-02')).toBe(1);
    expect(weekOf(c, '2026-11-08')).toBe(1);
    expect(weekOf(c, '2026-11-09')).toBe(2);
    expect(weekOf(c, '2026-11-29')).toBe(4);
    expect(weekOf(c, '2026-11-30')).toBeNull();
    expect(weekOf(c, '2026-11-01')).toBeNull();
  });
  it('finds the current and next cycles', () => {
    const a = { id: 'a', startsOn: '2026-10-05', endsOn: '2026-11-01' };
    const b = { id: 'b', startsOn: '2026-11-23', endsOn: '2026-12-20' };
    expect(currentCycle([a, b], '2026-10-20')?.id).toBe('a');
    expect(currentCycle([a, b], '2026-11-13')).toBeNull();
    expect(nextCycle([b, a], '2026-11-13')?.id).toBe('b');
    expect(nextCycle([a, b], '2026-12-25')).toBeNull();
  });
});

describe('week summary', () => {
  const change = (projectId: string, name: string, from: string | null, to: string, fromFormat = 'short', toFormat = 'short', at = 't1') =>
    ({ projectId, name, requester: 'Nico', fromStatus: from, toStatus: to, fromFormat, toFormat, at }) as Parameters<typeof weekSummary>[0]['changes'][number];

  it('describes the decisions on short topics', () => {
    expect(describeChange(change('a', 'A', null, 'received'))).toBe('nouveau sujet posé');
    expect(describeChange(change('a', 'A', 'received', 'bet'))).toBe('pris dans le cycle');
    expect(describeChange(change('a', 'A', 'received', 'waiting'))).toBe('pas maintenant');
    expect(describeChange(change('a', 'A', 'bet', 'shipped'))).toBe('livré');
    expect(describeChange(change('a', 'A', 'received', 'shaping', 'short', 'bet'))).toBe('devient un pari, en shaping');
    expect(describeChange(change('a', 'A', null, 'received', 'bet', 'bet'))).toBeNull();
  });

  it('combines the notes of the bets and the latest decision of each project', () => {
    const summary = weekSummary({
      bets: [
        { id: 'b1', name: 'Import', note: 'Import CSV terminé' },
        { id: 'b2', name: 'Export', note: null },
        { id: 'b3', name: 'Relances', note: null },
      ],
      changes: [
        change('b2', 'Export', 'bet', 'shipped', 'bet', 'bet'),
        change('s1', 'Logo flou', null, 'received', 'short', 'short', 't1'),
        change('s1', 'Logo flou', 'received', 'bet', 'short', 'short', 't2'),
        change('s2', 'Bouton rose', 'received', 'dropped'),
      ],
    });
    expect(summary.bets).toEqual(['Import : Import CSV terminé', 'Export : livré']);
    expect(summary.shortTopics).toEqual(['Logo flou (demandé par Nico) : pris dans le cycle', 'Bouton rose (demandé par Nico) : écarté']);
  });
});
