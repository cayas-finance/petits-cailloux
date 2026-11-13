import { describe, expect, it } from 'vitest';
import { bornesTrimestre, debutPropose, finCycle, lundiSuivant, numeroter, verifierCycle } from '../src/domain';

describe('trimestres', () => {
  it('calcule les bornes du T4 2026', () => {
    expect(bornesTrimestre(2026, 4)).toEqual({ debut: '2026-10-01', fin: '2026-12-31' });
  });
  it('gère février des années bissextiles', () => {
    expect(bornesTrimestre(2028, 1)).toEqual({ debut: '2028-01-01', fin: '2028-03-31' });
  });
});

describe('cycles', () => {
  const t4 = bornesTrimestre(2026, 4);
  it('un cycle dure 4 semaines', () => {
    expect(finCycle('2026-10-05')).toBe('2026-11-01');
  });
  it('propose le premier lundi du trimestre, puis enchaîne', () => {
    expect(lundiSuivant('2026-10-01')).toBe('2026-10-05');
    expect(debutPropose(t4, [])).toBe('2026-10-05');
    expect(debutPropose(t4, [{ id: 'a', debut: '2026-10-05', fin: '2026-11-01' }])).toBe('2026-11-02');
  });
  it('refuse un cycle hors trimestre, un autre jour que lundi, ou qui chevauche', () => {
    const existants = [{ id: 'a', debut: '2026-10-05', fin: '2026-11-01' }];
    expect(verifierCycle(t4, existants, '2027-01-04')).toMatch(/pendant le trimestre/);
    expect(verifierCycle(t4, existants, '2026-11-03')).toMatch(/lundi/);
    expect(verifierCycle(t4, existants, '2026-10-26')).toMatch(/chevauche/);
    expect(verifierCycle(t4, existants, '2026-11-02')).toBeNull();
  });
  it('limite à 3 cycles', () => {
    const trois = [
      { id: 'a', debut: '2026-10-05', fin: '2026-11-01' },
      { id: 'b', debut: '2026-11-02', fin: '2026-11-29' },
      { id: 'c', debut: '2026-11-30', fin: '2026-12-27' },
    ];
    expect(verifierCycle(t4, trois, '2026-12-28')).toMatch(/au plus 3/);
    expect(verifierCycle(t4, trois, '2026-11-30', 'c')).toBeNull();
  });
  it('numérote dans l’ordre chronologique', () => {
    expect(numeroter([{ debut: '2026-11-02' }, { debut: '2026-10-05' }]).map((c) => c.numero + c.debut)).toEqual([
      '12026-10-05',
      '22026-11-02',
    ]);
  });
});

import { verifierOwner, verifierProjet } from '../src/domain';

describe('projets', () => {
  it('exige un cycle pour un projet misé ou livré', () => {
    expect(verifierProjet({ statut: 'mise', cycleId: null })).toMatch(/cycle/);
    expect(verifierProjet({ statut: 'livre', cycleId: null })).toMatch(/cycle/);
    expect(verifierProjet({ statut: 'mise', cycleId: 'c1' })).toBeNull();
    expect(verifierProjet({ statut: 'recu', cycleId: null })).toBeNull();
  });
  it('n’accepte qu’un owner du domaine', () => {
    expect(verifierOwner('marine@cayas.fr', 'cayas.fr')).toBeNull();
    expect(verifierOwner('Marine@Cayas.fr ', 'cayas.fr')).toBeNull();
    expect(verifierOwner('marine@gmail.com', 'cayas.fr')).toMatch(/@cayas.fr/);
    expect(verifierOwner('marine', 'cayas.fr')).toMatch(/adresse/);
  });
});
