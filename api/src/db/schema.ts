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
