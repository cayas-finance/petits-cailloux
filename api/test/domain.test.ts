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

import { estAffichable, modelePitch, nettoyerNomFichier, verifierOwner, verifierProjet } from '../src/domain';

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

describe('pitch', () => {
  it('pré-remplit le modèle du guide', () => {
    const m = modelePitch('Import des relevés', 'thomas@cayas.fr', '2026-11-13');
    expect(m.startsWith('# Import des relevés\n')).toBe(true);
    expect(m).toContain('Rédigé par : thomas@cayas.fr · Date : 13/11/2026');
    for (const r of ['## Problème', '## Solution esquissée', '## Pièges identifiés', '## Hors périmètre', '## Comment on saura que c’est réussi'])
      expect(m).toContain(r);
  });

  it('ne sert dans le navigateur que les images et les PDF', () => {
    expect(estAffichable('image/png')).toBe(true);
    expect(estAffichable('application/pdf')).toBe(true);
    expect(estAffichable('image/svg+xml')).toBe(false);
    expect(estAffichable('text/html')).toBe(false);
  });

  it('nettoie les noms de fichiers', () => {
    expect(nettoyerNomFichier('C:\\temp\\maquette "v2".png')).toBe('maquette v2.png');
    expect(nettoyerNomFichier('../../etc/passwd')).toBe('passwd');
    expect(nettoyerNomFichier('   ')).toBe('fichier');
  });
});

describe('modèle de pitch', () => {
  it('ne demande pas les objectifs, déjà portés par le projet', () => {
    expect(modelePitch('X', 'a@cayas.fr', '2026-11-13')).not.toContain('Objectif servi');
  });
});

import { retirerLiensFichier } from '../src/domain';

describe('retrait d’un fichier joint', () => {
  const url = '/api/fichiers/abc';
  it('retire l’image seule sur sa ligne, sans laisser de ligne vide', () => {
    expect(retirerLiensFichier(`Avant\n![schema.png](${url})\nAprès`, url)).toBe('Avant\nAprès');
  });
  it('retire un lien au milieu d’une phrase', () => {
    expect(retirerLiensFichier(`Voir [notes.txt](${url}) ici`, url)).toBe('Voir  ici');
  });
  it('ne touche pas aux autres fichiers', () => {
    const autre = '[b](/api/fichiers/abcd)';
    expect(retirerLiensFichier(`${autre}\n[a](${url})`, url)).toBe(`${autre}\n`);
  });
});

import { cycleParDefaut, semaineDe, semaineDeNote } from '../src/domain';

describe('point hebdo', () => {
  const c = { debut: '2026-11-02', fin: '2026-11-29' };
  it('donne la semaine du cycle', () => {
    expect(semaineDe(c, '2026-11-02')).toBe(1);
    expect(semaineDe(c, '2026-11-08')).toBe(1);
    expect(semaineDe(c, '2026-11-09')).toBe(2);
    expect(semaineDe(c, '2026-11-29')).toBe(4);
    expect(semaineDe(c, '2026-11-30')).toBeNull();
    expect(semaineDe(c, '2026-11-01')).toBeNull();
  });
  it('choisit le cycle en cours, puis le prochain, puis le dernier', () => {
    const a = { id: 'a', debut: '2026-10-05', fin: '2026-11-01' };
    const b = { id: 'b', debut: '2026-11-02', fin: '2026-11-29' };
    expect(cycleParDefaut([a, b], '2026-11-13')?.id).toBe('b');
    expect(cycleParDefaut([b], '2026-10-20')?.id).toBe('b');
    expect(cycleParDefaut([a, b], '2026-12-15')?.id).toBe('b');
    expect(cycleParDefaut([], '2026-12-15')).toBeNull();
  });
});

describe('semaine de la note', () => {
  const c = { debut: '2026-11-23', fin: '2026-12-20' };
  it('range la note en semaine 1 avant le cycle, 4 après', () => {
    expect(semaineDeNote(c, '2026-11-13')).toBe(1);
    expect(semaineDeNote(c, '2026-12-01')).toBe(2);
    expect(semaineDeNote(c, '2027-01-05')).toBe(4);
  });
});
