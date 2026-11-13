import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, desc, inArray } from 'drizzle-orm';
import { authentifier } from './auth';
import type { Env } from './env';
import * as schema from './db/schema';
import { STATUTS_PROJET, cycles, fichiers, notesSuivi, objectifs, projetObjectifs, projets, trimestres } from './db/schema';
import {
  MAX_OBJECTIFS,
  TAILLE_MAX_FICHIER,
  TAILLE_MAX_PITCH,
  TITRE_MODELE,
  estAffichable,
  modelePitch,
  nettoyerNomFichier,
  retirerLiensFichier,
  bornesTrimestre,
  cycleEnCours,
  prochainCycle,
  semaineDe,
  versJour,
  debutPropose,
  finCycle,
  idTrimestre,
  numeroter,
  verifierCycle,
  verifierOwner,
  verifierProjet,
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

/** Modèle de pitch du guide, pour le formulaire de création */
app.get('/pitch/modele', (c) =>
  c.json({ pitch: modelePitch(TITRE_MODELE, c.get('email'), maintenant().slice(0, 10)) }),
);

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
  const objIds = (await db.select({ id: objectifs.id }).from(objectifs).where(eq(objectifs.trimestreId, id))).map((o) => o.id);
  const cyIds = (await db.select({ id: cycles.id }).from(cycles).where(eq(cycles.trimestreId, id))).map((x) => x.id);
  if (cyIds.length && (await db.select({ id: projets.id }).from(projets).where(inArray(projets.cycleId, cyIds))).length) {
    return c.json({ erreur: 'Des projets sont pris dans les cycles de ce trimestre. Changez-les de cycle avant de le supprimer.' }, 409);
  }
  await db.batch([
    db.delete(projetObjectifs).where(inArray(projetObjectifs.objectifId, objIds.length ? objIds : [''])),
    db.delete(objectifs).where(eq(objectifs.trimestreId, id)),
    db.delete(notesSuivi).where(inArray(notesSuivi.cycleId, cyIds.length ? cyIds : [''])),
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
  await db.batch([db.delete(projetObjectifs).where(eq(projetObjectifs.objectifId, o.id)), db.delete(objectifs).where(eq(objectifs.id, o.id))]);
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
  const lies = await db.select({ id: projets.id }).from(projets).where(eq(projets.cycleId, cy.id));
  if (lies.length) {
    return c.json({ erreur: `Ce cycle porte ${lies.length} projet${lies.length > 1 ? 's' : ''}. ${lies.length > 1 ? "Changez-les" : "Changez-le"} de cycle avant de le supprimer.` }, 409);
  }
  await db.batch([db.delete(notesSuivi).where(eq(notesSuivi.cycleId, cy.id)), db.delete(cycles).where(eq(cycles.id, cy.id))]);
  return c.json(await chargerTrimestre(c, cy.trimestreId));
});

/* ---------- Projets ---------- */

type Base = ReturnType<typeof base>;

async function projetsComplets(db: Base, ids?: string[]) {
  const ps = ids
    ? await db.select().from(projets).where(inArray(projets.id, ids))
    : await db.select().from(projets).orderBy(desc(projets.majLe));
  if (!ps.length) return [];
  const liens = await db.select().from(projetObjectifs).where(inArray(projetObjectifs.projetId, ps.map((p) => p.id)));
  const cys = numeroter(await db.select().from(cycles));
  return ps.map((p) => {
    const c = cys.find((x) => x.id === p.cycleId);
    return {
      ...p,
      objectifIds: liens.filter((l) => l.projetId === p.id).map((l) => l.objectifId),
      cycle: c ? { id: c.id, numero: c.numero, trimestreId: c.trimestreId, debut: c.debut, fin: c.fin } : null,
    };
  });
}

const corpsProjet = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire.').max(200, 'Le nom est trop long.'),
  owner: z.string().trim().max(200).optional(),
  statut: z.enum(STATUTS_PROJET, { error: 'Statut inconnu.' }).default('recu'),
  cycleId: z.string().nullable().default(null),
  objectifIds: z.array(z.string()).max(10).default([]),
  /** À la création seulement ; sinon le modèle du guide */
  pitch: z.string().max(TAILLE_MAX_PITCH, 'Le pitch est trop long.').optional(),
});

/** Vérifie le projet et ses références ; renvoie un message d'erreur ou null */
async function controlerProjet(db: Base, c: { env: Env['Bindings'] }, p: z.infer<typeof corpsProjet> & { owner: string }) {
  const e = verifierProjet(p) ?? verifierOwner(p.owner, c.env.DOMAINE_AUTORISE || 'cayas.fr');
  if (e) return e;
  if (p.cycleId && !(await db.query.cycles.findFirst({ where: eq(cycles.id, p.cycleId) }))) return 'Ce cycle n’existe plus.';
  if (p.objectifIds.length) {
    const trouves = await db.select({ id: objectifs.id }).from(objectifs).where(inArray(objectifs.id, p.objectifIds));
    if (trouves.length !== new Set(p.objectifIds).size) return 'Un des objectifs n’existe plus.';
  }
  return null;
}

app.get('/projets', async (c) => c.json(await projetsComplets(base(c))));

app.get('/projets/:id', async (c) => {
  const [p] = await projetsComplets(base(c), [c.req.param('id')]);
  return p ? c.json(p) : c.json({ erreur: 'Projet introuvable.' }, 404);
});

app.post('/projets', valider('json', corpsProjet), async (c) => {
  const db = base(c);
  const body = c.req.valid('json');
  const p = { ...body, owner: (body.owner || c.get('email')).toLowerCase() };
  const erreur = await controlerProjet(db, c, p);
  if (erreur) return c.json({ erreur }, 400);
  const id = crypto.randomUUID();
  const t = maintenant();
  const ids = [...new Set(p.objectifIds)];
  await db.batch([
    db.insert(projets).values({
      id,
      nom: p.nom,
      owner: p.owner,
      statut: p.statut,
      cycleId: p.cycleId,
      pitch: p.pitch ?? modelePitch(p.nom, p.owner, t.slice(0, 10)),
      creeLe: t,
      creePar: c.get('email'),
      majLe: t,
    }),
    ...ids.map((objectifId) => db.insert(projetObjectifs).values({ projetId: id, objectifId })),
  ]);
  const [cree] = await projetsComplets(db, [id]);
  return c.json(cree, 201);
});

app.patch('/projets/:id', valider('json', corpsProjet), async (c) => {
  const db = base(c);
  const id = c.req.param('id');
  const existant = await db.query.projets.findFirst({ where: eq(projets.id, id) });
  if (!existant) return c.json({ erreur: 'Projet introuvable.' }, 404);
  const body = c.req.valid('json');
  const p = { ...body, owner: (body.owner || existant.owner).toLowerCase() };
  const erreur = await controlerProjet(db, c, p);
  if (erreur) return c.json({ erreur }, 400);
  const ids = [...new Set(p.objectifIds)];
  await db.batch([
    db.update(projets).set({ nom: p.nom, owner: p.owner, statut: p.statut, cycleId: p.cycleId, majLe: maintenant() }).where(eq(projets.id, id)),
    db.delete(projetObjectifs).where(eq(projetObjectifs.projetId, id)),
    ...ids.map((objectifId) => db.insert(projetObjectifs).values({ projetId: id, objectifId })),
  ]);
  const [maj] = await projetsComplets(db, [id]);
  return c.json(maj);
});

app.delete('/projets/:id', async (c) => {
  const db = base(c);
  const id = c.req.param('id');
  const joints = await db.select({ id: fichiers.id }).from(fichiers).where(eq(fichiers.projetId, id));
  await db.batch([
    db.delete(projetObjectifs).where(eq(projetObjectifs.projetId, id)),
    db.delete(notesSuivi).where(eq(notesSuivi.projetId, id)),
    db.delete(fichiers).where(eq(fichiers.projetId, id)),
    db.delete(projets).where(eq(projets.id, id)),
  ]);
  if (joints.length) await c.env.FICHIERS.delete(joints.map((f) => cleFichier(id, f.id)));
  return c.body(null, 204);
});

/* ---------- Pitch et fichiers joints ---------- */

const cleFichier = (projetId: string, id: string) => `projets/${projetId}/${id}`;
const urlFichier = (id: string) => `/api/fichiers/${id}`;
const versFichier = (f: typeof fichiers.$inferSelect) => ({ ...f, url: urlFichier(f.id) });

app.put(
  '/projets/:id/pitch',
  valider('json', z.object({ pitch: z.string().max(TAILLE_MAX_PITCH, 'Le pitch est trop long.') })),
  async (c) => {
    const db = base(c);
    const id = c.req.param('id');
    const maj = await db
      .update(projets)
      .set({ pitch: c.req.valid('json').pitch, majLe: maintenant() })
      .where(eq(projets.id, id))
      .returning({ id: projets.id });
    if (!maj.length) return c.json({ erreur: 'Projet introuvable.' }, 404);
    const [p] = await projetsComplets(db, [id]);
    return c.json(p);
  },
);

app.get('/projets/:id/fichiers', async (c) => {
  const liste = await base(c)
    .select()
    .from(fichiers)
    .where(eq(fichiers.projetId, c.req.param('id')))
    .orderBy(asc(fichiers.creeLe));
  return c.json(liste.map(versFichier));
});

app.post('/projets/:id/fichiers', async (c) => {
  const db = base(c);
  const projetId = c.req.param('id');
  if (!(await db.query.projets.findFirst({ where: eq(projets.id, projetId) }))) {
    return c.json({ erreur: 'Projet introuvable.' }, 404);
  }
  const form = await c.req.formData().catch(() => null);
  const fichier = form?.get('fichier');
  if (!(fichier instanceof File)) return c.json({ erreur: 'Aucun fichier reçu.' }, 400);
  if (fichier.size === 0) return c.json({ erreur: 'Le fichier est vide.' }, 400);
  if (fichier.size > TAILLE_MAX_FICHIER) return c.json({ erreur: 'Le fichier dépasse 10 Mo.' }, 400);

  const id = crypto.randomUUID();
  const type = fichier.type || 'application/octet-stream';
  const ligne = {
    id,
    projetId,
    nom: nettoyerNomFichier(fichier.name),
    type,
    taille: fichier.size,
    creeLe: maintenant(),
    creePar: c.get('email'),
  };
  await c.env.FICHIERS.put(cleFichier(projetId, id), fichier.stream(), { httpMetadata: { contentType: type } });
  await db.insert(fichiers).values(ligne);
  return c.json(versFichier(ligne), 201);
});

app.get('/fichiers/:id', async (c) => {
  const f = await base(c).query.fichiers.findFirst({ where: eq(fichiers.id, c.req.param('id')) });
  if (!f) return c.json({ erreur: 'Fichier introuvable.' }, 404);
  const objet = await c.env.FICHIERS.get(cleFichier(f.projetId, f.id));
  if (!objet) return c.json({ erreur: 'Fichier introuvable.' }, 404);
  // Seuls les images et les PDF s'affichent dans le navigateur ; le reste est
  // téléchargé, pour qu'un fichier déposé ne puisse pas s'exécuter sur le site.
  const affichable = estAffichable(f.type);
  const nom = encodeURIComponent(f.nom);
  const entetes: Record<string, string> = {
    'Content-Type': affichable ? f.type : 'application/octet-stream',
    'Content-Disposition': `${affichable ? 'inline' : 'attachment'}; filename*=UTF-8''${nom}`,
    'Content-Length': String(f.taille),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable',
  };
  // Le lecteur PDF du navigateur ne s'ouvre pas dans un document « sandbox ».
  if (f.type !== 'application/pdf') entetes['Content-Security-Policy'] = "default-src 'none'; sandbox";
  return new Response(objet.body, { headers: entetes });
});

app.delete('/fichiers/:id', async (c) => {
  const db = base(c);
  const f = await db.query.fichiers.findFirst({ where: eq(fichiers.id, c.req.param('id')) });
  if (!f) return c.json({ erreur: 'Fichier introuvable.' }, 404);
  // On retire aussi ses liens et images du pitch, et on renvoie le projet à jour.
  const projet = await db.query.projets.findFirst({ where: eq(projets.id, f.projetId) });
  const pitch = projet ? retirerLiensFichier(projet.pitch, urlFichier(f.id)) : '';
  await db.batch([
    db.delete(fichiers).where(eq(fichiers.id, f.id)),
    ...(projet && pitch !== projet.pitch
      ? [db.update(projets).set({ pitch, majLe: maintenant() }).where(eq(projets.id, projet.id))]
      : []),
  ]);
  await c.env.FICHIERS.delete(cleFichier(f.projetId, f.id));
  const [p] = await projetsComplets(db, [f.projetId]);
  return c.json(p ?? null);
});

/* ---------- Point hebdo ---------- */

/** Paris du cycle en cours (misés ou livrés), avec leurs notes de suivi par semaine. */
app.get('/point-hebdo', async (c) => {
  const db = base(c);
  const jour = versJour(new Date());
  const tous = numeroter(await db.select().from(cycles));
  // Le point hebdo porte uniquement sur le cycle en cours.
  const cycle = cycleEnCours(tous, jour);
  if (!cycle) return c.json({ cycle: null, semaine: null, prochain: prochainCycle(tous, jour), paris: [] });

  const ps = await db
    .select({ id: projets.id })
    .from(projets)
    .where(and(eq(projets.cycleId, cycle.id), inArray(projets.statut, ['mise', 'livre'])));
  const paris = await projetsComplets(db, ps.map((p) => p.id));
  const notes = ps.length
    ? await db.select().from(notesSuivi).where(and(eq(notesSuivi.cycleId, cycle.id), inArray(notesSuivi.projetId, ps.map((p) => p.id))))
    : [];
  return c.json({
    cycle,
    semaine: semaineDe(cycle, jour),
    prochain: null,
    paris: paris
      .sort((a, b) => (a.statut === b.statut ? a.nom.localeCompare(b.nom, 'fr') : a.statut === 'mise' ? -1 : 1))
      .map((p) => ({ ...p, notes: notes.filter((n) => n.projetId === p.id).sort((a, b) => b.semaine - a.semaine) })),
  });
});

/** Note de suivi d'un pari pour une semaine du cycle ; un texte vide la supprime. */
app.put(
  '/projets/:id/notes/:cycleId/:semaine',
  valider('json', z.object({ texte: z.string().trim().max(4000, 'La note est trop longue.') })),
  async (c) => {
    const db = base(c);
    const { id, cycleId } = c.req.param();
    const semaine = Number(c.req.param('semaine'));
    if (!Number.isInteger(semaine) || semaine < 1 || semaine > 4) return c.json({ erreur: 'Semaine invalide.' }, 400);
    const p = await db.query.projets.findFirst({ where: eq(projets.id, id) });
    if (!p) return c.json({ erreur: 'Projet introuvable.' }, 404);
    if (p.cycleId !== cycleId) return c.json({ erreur: 'Ce projet n’est pas pris dans ce cycle.' }, 400);

    const { texte } = c.req.valid('json');
    const cle = and(eq(notesSuivi.projetId, id), eq(notesSuivi.cycleId, cycleId), eq(notesSuivi.semaine, semaine));
    if (!texte) {
      await db.delete(notesSuivi).where(cle);
      return c.json(null);
    }
    const t = maintenant();
    const email = c.get('email');
    const [note] = await db
      .insert(notesSuivi)
      .values({ id: crypto.randomUUID(), projetId: id, cycleId, semaine, texte, creeLe: t, creePar: email, majLe: t, majPar: email })
      .onConflictDoUpdate({
        target: [notesSuivi.projetId, notesSuivi.cycleId, notesSuivi.semaine],
        set: { texte, majLe: t, majPar: email },
      })
      .returning();
    return c.json(note);
  },
);

/** Change seulement le statut d'un projet (ex. « Marquer livré » au point hebdo). */
app.patch(
  '/projets/:id/statut',
  valider('json', z.object({ statut: z.enum(STATUTS_PROJET, { error: 'Statut inconnu.' }) })),
  async (c) => {
    const db = base(c);
    const id = c.req.param('id');
    const p = await db.query.projets.findFirst({ where: eq(projets.id, id) });
    if (!p) return c.json({ erreur: 'Projet introuvable.' }, 404);
    const { statut } = c.req.valid('json');
    const erreur = verifierProjet({ statut, cycleId: p.cycleId });
    if (erreur) return c.json({ erreur }, 400);
    await db.update(projets).set({ statut, majLe: maintenant() }).where(eq(projets.id, id));
    const [maj] = await projetsComplets(db, [id]);
    return c.json(maj);
  },
);

app.all('*', (c) => c.json({ erreur: 'Route inconnue.' }, 404));

export default app;
