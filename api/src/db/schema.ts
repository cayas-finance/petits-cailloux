import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

const horodatage = {
  creeLe: text('cree_le').notNull(),
  creePar: text('cree_par').notNull(),
};

export const trimestres = sqliteTable(
  'trimestres',
  {
    id: text('id').primaryKey(), // ex. 2026-T4
    annee: integer('annee').notNull(),
    numero: integer('numero').notNull(), // 1 à 4
    debut: text('debut').notNull(),
    fin: text('fin').notNull(),
    ...horodatage,
  },
  (t) => [uniqueIndex('trimestres_annee_numero').on(t.annee, t.numero)],
);

export const objectifs = sqliteTable(
  'objectifs',
  {
    id: text('id').primaryKey(),
    trimestreId: text('trimestre_id')
      .notNull()
      .references(() => trimestres.id, { onDelete: 'cascade' }),
    titre: text('titre').notNull(),
    description: text('description').notNull().default(''),
    ...horodatage,
  },
  (t) => [index('objectifs_trimestre').on(t.trimestreId)],
);

export const cycles = sqliteTable(
  'cycles',
  {
    id: text('id').primaryKey(),
    trimestreId: text('trimestre_id')
      .notNull()
      .references(() => trimestres.id, { onDelete: 'cascade' }),
    debut: text('debut').notNull(),
    fin: text('fin').notNull(),
    ...horodatage,
  },
  (t) => [index('cycles_trimestre').on(t.trimestreId)],
);

/** Statuts d'un projet, dans l'ordre du parcours */
export const STATUTS_PROJET = ['recu', 'shaping', 'pret', 'attente', 'mise', 'livre', 'ecarte'] as const;
export type StatutProjet = (typeof STATUTS_PROJET)[number];

export const projets = sqliteTable(
  'projets',
  {
    id: text('id').primaryKey(),
    nom: text('nom').notNull(),
    /** Adresse e-mail de la personne qui porte le projet */
    owner: text('owner').notNull(),
    statut: text('statut', { enum: STATUTS_PROJET }).notNull().default('recu'),
    /** Cycle dans lequel le projet est pris ; vide tant qu'il n'est pas misé */
    cycleId: text('cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
    creeLe: text('cree_le').notNull(),
    creePar: text('cree_par').notNull(),
    majLe: text('maj_le').notNull(),
  },
  (t) => [index('projets_cycle').on(t.cycleId), index('projets_statut').on(t.statut)],
);

/** Un projet peut servir 0, 1 ou plusieurs objectifs */
export const projetObjectifs = sqliteTable(
  'projet_objectifs',
  {
    projetId: text('projet_id')
      .notNull()
      .references(() => projets.id, { onDelete: 'cascade' }),
    objectifId: text('objectif_id')
      .notNull()
      .references(() => objectifs.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('projet_objectifs_pk').on(t.projetId, t.objectifId), index('projet_objectifs_objectif').on(t.objectifId)],
);
