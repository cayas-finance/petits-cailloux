import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, desc } from 'drizzle-orm';
import { authentifier } from './auth';
import type { Env } from './env';
import * as schema from './db/schema';
import { cycles, objectifs, trimestres } from './db/schema';
import {
  MAX_OBJECTIFS,
  bornesTrimestre,
  debutPropose,
  finCycle,
  idTrimestre,
  numeroter,
  verifierCycle,
} from './domain';

const app = new Hono<Env>().basePath('/api');

app.use('*', authentifier);

app.onError((err, c) => {
  console.error(err);
  return c.json({ erreur: 'Erreur inattendue. Réessayez dans un instant.' }, 500);
});

const base = (c: { env: Env['Bindings'] }) => drizzle(c.env.DB, { schema });
const maintenant = () => new Date().toISOString();

/* Validation : renvoie le premier message d'erreur en français */
const valider = <T extends z.ZodType>(cible: 'json' | 'param', s: T) =>
  zValidator(cible, s, (r, c) => {
    if (!r.success) return c.json({ erreur: r.error.issues[0]?.message ?? 'Données invalides.' }, 400);
  });

const titre = z.string().trim().min(1, 'Le titre est obligatoire.').max(200, 'Le titre est trop long.');
const description = z.string().trim().max(2000, 'La description est trop longue.');

app.get('/moi', (c) => c.json({ email: c.get('email') }));

/* ---------- Trimestres ---------- */

async function chargerTrimestre(c: { env: Env['Bindings'] }, id: string) {
  const db = base(c);
  const t = await db.query.trimestres.findFirst({ where: eq(trimestres.id, id) });
  if (!t) return null;
  const objs = await db.select().from(objectifs).where(eq(objectifs.trimestreId, id)).orderBy(asc(objectifs.creeLe));
  const cys = await db.select().from(cycles).where(eq(cycles.trimestreId, id));
  return {
    ...t,
    objectifs: objs,
    cycles: numeroter(cys),
    prochainDebut: debutPropose(t, cys),
  };
}

app.get('/trimestres', async (c) => {
  const db = base(c);
  const ts = await db.select().from(trimestres).orderBy(desc(trimestres.annee), desc(trimestres.numero));
  const objs = await db.select().from(objectifs).orderBy(asc(objectifs.creeLe));
  const cys = await db.select().from(cycles);
  return c.json(
    ts.map((t) => ({
      ...t,
      objectifs: objs.filter((o) => o.trimestreId === t.id),
      cycles: numeroter(cys.filter((x) => x.trimestreId === t.id)),
    })),
  );
});

app.get('/trimestres/:id', async (c) => {
  const t = await chargerTrimestre(c, c.req.param('id'));
  return t ? c.json(t) : c.json({ erreur: 'Trimestre introuvable.' }, 404);
});

app.post(
  '/trimestres',
  valider(
    'json',
    z.object({
      annee: z.number().int().min(2024, 'Année invalide.').max(2100, 'Année invalide.'),
      numero: z.number().int().min(1, 'Trimestre invalide.').max(4, 'Trimestre invalide.'),
    }),
  ),
  async (c) => {
    const { annee, numero } = c.req.valid('json');
    const id = idTrimestre(annee, numero);
    const db = base(c);
    if (await db.query.trimestres.findFirst({ where: eq(trimestres.id, id) })) {
      return c.json({ erreur: `Le trimestre T${numero} ${annee} existe déjà.` }, 409);
    }
    await db.insert(trimestres).values({
      id,
      annee,
      numero,
      ...bornesTrimestre(annee, numero),
      creeLe: maintenant(),
      creePar: c.get('email'),
    });
    return c.json(await chargerTrimestre(c, id), 201);
  },
);

app.delete('/trimestres/:id', async (c) => {
  const id = c.req.param('id');
  const db = base(c);
  // D1 n'applique pas toujours les cascades : on supprime explicitement, dans un seul lot.
  await db.batch([
    db.delete(objectifs).where(eq(objectifs.trimestreId, id)),
    db.delete(cycles).where(eq(cycles.trimestreId, id)),
    db.delete(trimestres).where(eq(trimestres.id, id)),
  ]);
  return c.body(null, 204);
});

/* ---------- Objectifs ---------- */

app.post(
  '/trimestres/:id/objectifs',
  valider('json', z.object({ titre, description: description.default('') })),
  async (c) => {
    const trimestreId = c.req.param('id');
    const db = base(c);
    if (!(await db.query.trimestres.findFirst({ where: eq(trimestres.id, trimestreId) }))) {
      return c.json({ erreur: 'Trimestre introuvable.' }, 404);
    }
    const existants = await db.select().from(objectifs).where(eq(objectifs.trimestreId, trimestreId));
    if (existants.length >= MAX_OBJECTIFS) {
      return c.json({ erreur: `Un trimestre porte au plus ${MAX_OBJECTIFS} objectifs.` }, 409);
    }
    const body = c.req.valid('json');
    await db.insert(objectifs).values({
      id: crypto.randomUUID(),
      trimestreId,
      titre: body.titre,
      description: body.description,
      creeLe: maintenant(),
      creePar: c.get('email'),
    });
    return c.json(await chargerTrimestre(c, trimestreId), 201);
  },
);

app.patch(
  '/objectifs/:id',
  valider('json', z.object({ titre, description })),
  async (c) => {
    const db = base(c);
    const o = await db.query.objectifs.findFirst({ where: eq(objectifs.id, c.req.param('id')) });
    if (!o) return c.json({ erreur: 'Objectif introuvable.' }, 404);
    await db.update(objectifs).set(c.req.valid('json')).where(eq(objectifs.id, o.id));
    return c.json(await chargerTrimestre(c, o.trimestreId));
  },
);

app.delete('/objectifs/:id', async (c) => {
  const db = base(c);
  const o = await db.query.objectifs.findFirst({ where: eq(objectifs.id, c.req.param('id')) });
  if (!o) return c.body(null, 204);
  await db.delete(objectifs).where(eq(objectifs.id, o.id));
  return c.json(await chargerTrimestre(c, o.trimestreId));
});

/* ---------- Cycles ---------- */

const corpsCycle = z.object({ debut: z.string() });

app.post('/trimestres/:id/cycles', valider('json', corpsCycle), async (c) => {
  const trimestreId = c.req.param('id');
  const db = base(c);
  const t = await db.query.trimestres.findFirst({ where: eq(trimestres.id, trimestreId) });
  if (!t) return c.json({ erreur: 'Trimestre introuvable.' }, 404);
  const existants = await db.select().from(cycles).where(eq(cycles.trimestreId, trimestreId));
  const { debut } = c.req.valid('json');
  const erreur = verifierCycle(t, existants, debut);
  if (erreur) return c.json({ erreur }, 409);
  await db.insert(cycles).values({
    id: crypto.randomUUID(),
    trimestreId,
    debut,
    fin: finCycle(debut),
    creeLe: maintenant(),
    creePar: c.get('email'),
  });
  return c.json(await chargerTrimestre(c, trimestreId), 201);
});

app.patch('/cycles/:id', valider('json', corpsCycle), async (c) => {
  const db = base(c);
  const cy = await db.query.cycles.findFirst({ where: eq(cycles.id, c.req.param('id')) });
  if (!cy) return c.json({ erreur: 'Cycle introuvable.' }, 404);
  const t = (await db.query.trimestres.findFirst({ where: eq(trimestres.id, cy.trimestreId) }))!;
  const existants = await db.select().from(cycles).where(eq(cycles.trimestreId, cy.trimestreId));
  const { debut } = c.req.valid('json');
  const erreur = verifierCycle(t, existants, debut, cy.id);
  if (erreur) return c.json({ erreur }, 409);
  await db
    .update(cycles)
    .set({ debut, fin: finCycle(debut) })
    .where(and(eq(cycles.id, cy.id), eq(cycles.trimestreId, t.id)));
  return c.json(await chargerTrimestre(c, t.id));
});

app.delete('/cycles/:id', async (c) => {
  const db = base(c);
  const cy = await db.query.cycles.findFirst({ where: eq(cycles.id, c.req.param('id')) });
  if (!cy) return c.body(null, 204);
  await db.delete(cycles).where(eq(cycles.id, cy.id));
  return c.json(await chargerTrimestre(c, cy.trimestreId));
});

app.all('*', (c) => c.json({ erreur: 'Route inconnue.' }, 404));

export default app;
