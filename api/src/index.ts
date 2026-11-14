import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, desc, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { authenticate } from './auth';
import type { Env } from './env';
import * as schema from './db/schema';
import { announcements, attachments, cycles, goals, progressNotes, projectChanges, projectGoals, projects, quarters } from './db/schema';
import {
  MAX_ATTACHMENT_SIZE,
  MAX_GOALS,
  MAX_PITCH_LENGTH,
  PROJECT_STATUSES,
  TEMPLATE_TITLE,
  checkCycle,
  checkOwner,
  checkProject,
  cleanFilename,
  currentCycle,
  cycleEnd,
  isInline,
  logDecision,
  logWeeks,
  nextCycle,
  numberCycles,
  PROJECT_FORMATS,
  pitchTemplate,
  promotedPitch,
  quarterBounds,
  quarterId,
  removeAttachmentLinks,
  suggestedStart,
  toDay,
  weekOf,
  weekSummary,
} from './domain';

const app = new Hono<Env>().basePath('/api');

app.use('*', authenticate);

// Every error body is { error: "<message in French>" }: the UI shows it as is.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Erreur inattendue. Réessayez dans un instant.' }, 500);
});

const database = (c: { env: Env['Bindings'] }) => drizzle(c.env.DB, { schema });
type Db = ReturnType<typeof database>;
const now = () => new Date().toISOString();

/** Validation: returns the first error message */
const validate = <T extends z.ZodType>(target: 'json' | 'param', s: T) =>
  zValidator(target, s, (r, c) => {
    if (!r.success) return c.json({ error: r.error.issues[0]?.message ?? 'Données invalides.' }, 400);
  });

const title = z.string().trim().min(1, 'Le titre est obligatoire.').max(200, 'Le titre est trop long.');
const description = z.string().trim().max(2000, 'La description est trop longue.');

app.get('/me', (c) => c.json({ email: c.get('email') }));

/** The guide's pitch template, for the creation form */
app.get('/pitch/template', (c) => c.json({ pitch: pitchTemplate(TEMPLATE_TITLE, c.get('email'), now().slice(0, 10)) }));

/* ---------- Quarters ---------- */

async function loadQuarter(c: { env: Env['Bindings'] }, id: string) {
  const db = database(c);
  const q = await db.query.quarters.findFirst({ where: eq(quarters.id, id) });
  if (!q) return null;
  const qGoals = await db.select().from(goals).where(eq(goals.quarterId, id)).orderBy(asc(goals.createdAt));
  const qCycles = await db.select().from(cycles).where(eq(cycles.quarterId, id));
  return { ...q, goals: qGoals, cycles: numberCycles(qCycles), nextStart: suggestedStart(q, qCycles) };
}

app.get('/quarters', async (c) => {
  const db = database(c);
  const qs = await db.select().from(quarters).orderBy(desc(quarters.year), desc(quarters.number));
  const allGoals = await db.select().from(goals).orderBy(asc(goals.createdAt));
  const allCycles = await db.select().from(cycles);
  return c.json(
    qs.map((q) => ({
      ...q,
      goals: allGoals.filter((g) => g.quarterId === q.id),
      cycles: numberCycles(allCycles.filter((x) => x.quarterId === q.id)),
    })),
  );
});

app.get('/quarters/:id', async (c) => {
  const q = await loadQuarter(c, c.req.param('id'));
  return q ? c.json(q) : c.json({ error: 'Trimestre introuvable.' }, 404);
});

app.post(
  '/quarters',
  validate(
    'json',
    z.object({
      year: z.number().int().min(2024, 'Année invalide.').max(2100, 'Année invalide.'),
      number: z.number().int().min(1, 'Trimestre invalide.').max(4, 'Trimestre invalide.'),
    }),
  ),
  async (c) => {
    const { year, number } = c.req.valid('json');
    const id = quarterId(year, number);
    const db = database(c);
    if (await db.query.quarters.findFirst({ where: eq(quarters.id, id) })) {
      return c.json({ error: `Le trimestre T${number} ${year} existe déjà.` }, 409);
    }
    await db.insert(quarters).values({
      id,
      year,
      number,
      ...quarterBounds(year, number),
      createdAt: now(),
      createdBy: c.get('email'),
    });
    return c.json(await loadQuarter(c, id), 201);
  },
);

app.delete('/quarters/:id', async (c) => {
  const id = c.req.param('id');
  const db = database(c);
  // D1 does not always apply cascades: delete explicitly, in a single batch.
  const goalIds = (await db.select({ id: goals.id }).from(goals).where(eq(goals.quarterId, id))).map((g) => g.id);
  const cycleIds = (await db.select({ id: cycles.id }).from(cycles).where(eq(cycles.quarterId, id))).map((x) => x.id);
  if (cycleIds.length && (await db.select({ id: projects.id }).from(projects).where(inArray(projects.cycleId, cycleIds))).length) {
    return c.json({ error: 'Des projets sont pris dans les cycles de ce trimestre. Changez-les de cycle avant de le supprimer.' }, 409);
  }
  await db.batch([
    db.delete(projectGoals).where(inArray(projectGoals.goalId, goalIds.length ? goalIds : [''])),
    db.delete(goals).where(eq(goals.quarterId, id)),
    db.delete(progressNotes).where(inArray(progressNotes.cycleId, cycleIds.length ? cycleIds : [''])),
    db.delete(announcements).where(inArray(announcements.cycleId, cycleIds.length ? cycleIds : [''])),
    db
      .update(projectChanges)
      .set({ cycleId: null, week: null })
      .where(inArray(projectChanges.cycleId, cycleIds.length ? cycleIds : [''])),
    db.delete(cycles).where(eq(cycles.quarterId, id)),
    db.delete(quarters).where(eq(quarters.id, id)),
  ]);
  return c.body(null, 204);
});

/* ---------- Goals ---------- */

app.post('/quarters/:id/goals', validate('json', z.object({ title, description: description.default('') })), async (c) => {
  const qId = c.req.param('id');
  const db = database(c);
  if (!(await db.query.quarters.findFirst({ where: eq(quarters.id, qId) }))) {
    return c.json({ error: 'Trimestre introuvable.' }, 404);
  }
  const existing = await db.select().from(goals).where(eq(goals.quarterId, qId));
  if (existing.length >= MAX_GOALS) {
    return c.json({ error: `Un trimestre porte au plus ${MAX_GOALS} objectifs.` }, 409);
  }
  const body = c.req.valid('json');
  await db.insert(goals).values({
    id: crypto.randomUUID(),
    quarterId: qId,
    title: body.title,
    description: body.description,
    createdAt: now(),
    createdBy: c.get('email'),
  });
  return c.json(await loadQuarter(c, qId), 201);
});

app.patch('/goals/:id', validate('json', z.object({ title, description })), async (c) => {
  const db = database(c);
  const g = await db.query.goals.findFirst({ where: eq(goals.id, c.req.param('id')) });
  if (!g) return c.json({ error: 'Objectif introuvable.' }, 404);
  await db.update(goals).set(c.req.valid('json')).where(eq(goals.id, g.id));
  return c.json(await loadQuarter(c, g.quarterId));
});

app.delete('/goals/:id', async (c) => {
  const db = database(c);
  const g = await db.query.goals.findFirst({ where: eq(goals.id, c.req.param('id')) });
  if (!g) return c.body(null, 204);
  await db.batch([db.delete(projectGoals).where(eq(projectGoals.goalId, g.id)), db.delete(goals).where(eq(goals.id, g.id))]);
  return c.json(await loadQuarter(c, g.quarterId));
});

/* ---------- Cycles ---------- */

const cycleBody = z.object({ startsOn: z.string() });

app.post('/quarters/:id/cycles', validate('json', cycleBody), async (c) => {
  const qId = c.req.param('id');
  const db = database(c);
  const q = await db.query.quarters.findFirst({ where: eq(quarters.id, qId) });
  if (!q) return c.json({ error: 'Trimestre introuvable.' }, 404);
  const existing = await db.select().from(cycles).where(eq(cycles.quarterId, qId));
  const { startsOn } = c.req.valid('json');
  const error = checkCycle(q, existing, startsOn);
  if (error) return c.json({ error }, 409);
  await db.insert(cycles).values({
    id: crypto.randomUUID(),
    quarterId: qId,
    startsOn,
    endsOn: cycleEnd(startsOn),
    createdAt: now(),
    createdBy: c.get('email'),
  });
  return c.json(await loadQuarter(c, qId), 201);
});

app.patch('/cycles/:id', validate('json', cycleBody), async (c) => {
  const db = database(c);
  const cy = await db.query.cycles.findFirst({ where: eq(cycles.id, c.req.param('id')) });
  if (!cy) return c.json({ error: 'Cycle introuvable.' }, 404);
  const q = (await db.query.quarters.findFirst({ where: eq(quarters.id, cy.quarterId) }))!;
  const existing = await db.select().from(cycles).where(eq(cycles.quarterId, cy.quarterId));
  const { startsOn } = c.req.valid('json');
  const error = checkCycle(q, existing, startsOn, cy.id);
  if (error) return c.json({ error }, 409);
  await db
    .update(cycles)
    .set({ startsOn, endsOn: cycleEnd(startsOn) })
    .where(and(eq(cycles.id, cy.id), eq(cycles.quarterId, q.id)));
  return c.json(await loadQuarter(c, q.id));
});

app.delete('/cycles/:id', async (c) => {
  const db = database(c);
  const cy = await db.query.cycles.findFirst({ where: eq(cycles.id, c.req.param('id')) });
  if (!cy) return c.body(null, 204);
  const linked = await db.select({ id: projects.id }).from(projects).where(eq(projects.cycleId, cy.id));
  if (linked.length) {
    const n = linked.length;
    return c.json(
      { error: `Ce cycle porte ${n} projet${n > 1 ? 's' : ''}. ${n > 1 ? 'Changez-les' : 'Changez-le'} de cycle avant de le supprimer.` },
      409,
    );
  }
  await db.batch([
    db.delete(progressNotes).where(eq(progressNotes.cycleId, cy.id)),
    db.delete(announcements).where(eq(announcements.cycleId, cy.id)),
    db.update(projectChanges).set({ cycleId: null, week: null }).where(eq(projectChanges.cycleId, cy.id)),
    db.delete(cycles).where(eq(cycles.id, cy.id)),
  ]);
  return c.json(await loadQuarter(c, cy.quarterId));
});

/* ---------- Projects ---------- */

/** Projects with their goal ids and their numbered cycle */
async function fullProjects(db: Db, ids?: string[]) {
  const ps = ids
    ? await db.select().from(projects).where(inArray(projects.id, ids))
    : await db.select().from(projects).orderBy(desc(projects.updatedAt));
  if (!ps.length) return [];
  const links = await db.select().from(projectGoals).where(inArray(projectGoals.projectId, ps.map((p) => p.id)));
  const allCycles = numberCycles(await db.select().from(cycles));
  return ps.map((p) => {
    const cy = allCycles.find((x) => x.id === p.cycleId);
    return {
      ...p,
      goalIds: links.filter((l) => l.projectId === p.id).map((l) => l.goalId),
      cycle: cy ? { id: cy.id, number: cy.number, quarterId: cy.quarterId, startsOn: cy.startsOn, endsOn: cy.endsOn } : null,
    };
  });
}

type StatusAndFormat = Pick<typeof projects.$inferSelect, 'status' | 'format'>;

/** Cycle and week running today, to date the decisions */
async function runningWeek(db: Db) {
  const today = toDay(new Date());
  const cycle = currentCycle(await db.select().from(cycles), today);
  return { cycleId: cycle?.id ?? null, week: cycle ? weekOf(cycle, today) : null };
}

/**
 * Records a change of status or format, dated in the running cycle: the decisions of the week.
 * Returns the inserts to add to a batch: none when nothing changed.
 */
function recordChange(
  db: Db,
  when: { cycleId: string | null; week: number | null },
  email: string,
  projectId: string,
  before: StatusAndFormat | null,
  after: StatusAndFormat,
) {
  if (before && before.status === after.status && before.format === after.format) return [];
  return [
    db.insert(projectChanges).values({
      id: crypto.randomUUID(),
      projectId,
      ...when,
      fromStatus: before?.status ?? null,
      toStatus: after.status,
      fromFormat: before?.format ?? null,
      toFormat: after.format,
      createdAt: now(),
      createdBy: email,
    }),
  ];
}

const projectBody = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200, 'Le nom est trop long.'),
  format: z.enum(PROJECT_FORMATS, { error: 'Format inconnu.' }).default('bet'),
  owner: z.string().trim().max(200).optional(),
  requester: z.string().trim().max(200, 'Le demandeur est trop long.').default(''),
  status: z.enum(PROJECT_STATUSES, { error: 'Statut inconnu.' }).default('received'),
  cycleId: z.string().nullable().default(null),
  goalIds: z.array(z.string()).max(10).default([]),
  /** On creation only; the guide's template otherwise (for a bet) */
  pitch: z.string().max(MAX_PITCH_LENGTH, 'Le pitch est trop long.').optional(),
});

type ProjectData = Omit<z.infer<typeof projectBody>, 'owner'> & { owner: string | null };

/** A bet has an owner (by default the person who writes it); a short topic only has a requester. */
function withOwner(body: z.infer<typeof projectBody>, fallback: string | null): ProjectData {
  const owner = body.format === 'short' ? null : (body.owner || fallback || '').toLowerCase();
  return { ...body, owner };
}

/** Checks the project and its references; returns an error message or null */
async function validateProject(db: Db, c: { env: Env['Bindings'] }, p: ProjectData) {
  const error = checkProject(p) ?? (p.owner !== null ? checkOwner(p.owner, c.env.ALLOWED_DOMAIN || 'cayas.fr') : null);
  if (error) return error;
  if (p.cycleId && !(await db.query.cycles.findFirst({ where: eq(cycles.id, p.cycleId) }))) return 'Ce cycle n’existe plus.';
  if (p.goalIds.length) {
    const found = await db.select({ id: goals.id }).from(goals).where(inArray(goals.id, p.goalIds));
    if (found.length !== new Set(p.goalIds).size) return 'Un des objectifs n’existe plus.';
  }
  return null;
}

app.get('/projects', async (c) => c.json(await fullProjects(database(c))));

app.get('/projects/:id', async (c) => {
  const [p] = await fullProjects(database(c), [c.req.param('id')]);
  return p ? c.json(p) : c.json({ error: 'Projet introuvable.' }, 404);
});

app.post('/projects', validate('json', projectBody), async (c) => {
  const db = database(c);
  const p = withOwner(c.req.valid('json'), c.get('email'));
  const error = await validateProject(db, c, p);
  if (error) return c.json({ error }, 400);
  const id = crypto.randomUUID();
  const t = now();
  const change = recordChange(db, await runningWeek(db), c.get('email'), id, null, p);
  await db.batch([
    db.insert(projects).values({
      id,
      name: p.name,
      format: p.format,
      owner: p.owner,
      requester: p.requester,
      status: p.status,
      cycleId: p.cycleId,
      pitch: p.pitch ?? (p.format === 'bet' ? pitchTemplate(p.name, p.owner ?? c.get('email'), t.slice(0, 10)) : ''),
      createdAt: t,
      createdBy: c.get('email'),
      updatedAt: t,
    }),
    ...[...new Set(p.goalIds)].map((goalId) => db.insert(projectGoals).values({ projectId: id, goalId })),
    ...change,
  ]);
  const [created] = await fullProjects(db, [id]);
  return c.json(created, 201);
});

app.patch('/projects/:id', validate('json', projectBody), async (c) => {
  const db = database(c);
  const id = c.req.param('id');
  const existing = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!existing) return c.json({ error: 'Projet introuvable.' }, 404);
  const p = withOwner(c.req.valid('json'), existing.owner ?? c.get('email'));
  const error = await validateProject(db, c, p);
  if (error) return c.json({ error }, 400);
  const change = recordChange(db, await runningWeek(db), c.get('email'), id, existing, p);
  await db.batch([
    db
      .update(projects)
      .set({
        name: p.name,
        format: p.format,
        owner: p.owner,
        requester: p.requester,
        status: p.status,
        cycleId: p.cycleId,
        updatedAt: now(),
      })
      .where(eq(projects.id, id)),
    db.delete(projectGoals).where(eq(projectGoals.projectId, id)),
    ...[...new Set(p.goalIds)].map((goalId) => db.insert(projectGoals).values({ projectId: id, goalId })),
    ...change,
  ]);
  const [updated] = await fullProjects(db, [id]);
  return c.json(updated);
});

app.delete('/projects/:id', async (c) => {
  const db = database(c);
  const id = c.req.param('id');
  const files = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.projectId, id));
  await db.batch([
    db.delete(projectGoals).where(eq(projectGoals.projectId, id)),
    db.delete(progressNotes).where(eq(progressNotes.projectId, id)),
    db.delete(projectChanges).where(eq(projectChanges.projectId, id)),
    db.delete(attachments).where(eq(attachments.projectId, id)),
    db.delete(projects).where(eq(projects.id, id)),
  ]);
  if (files.length) await c.env.ATTACHMENTS.delete(files.map((f) => attachmentKey(id, f.id)));
  return c.body(null, 204);
});

/**
 * Changes only the status of a project, and its cycle when given: "Marquer livré",
 * or the decisions on a short topic at the weekly review.
 */
app.patch(
  '/projects/:id/status',
  validate(
    'json',
    z.object({
      status: z.enum(PROJECT_STATUSES, { error: 'Statut inconnu.' }),
      cycleId: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const db = database(c);
    const id = c.req.param('id');
    const p = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    if (!p) return c.json({ error: 'Projet introuvable.' }, 404);
    const { status, cycleId: newCycle } = c.req.valid('json');
    const cycleId = newCycle === undefined ? p.cycleId : newCycle;
    const error = checkProject({ ...p, status, cycleId });
    if (error) return c.json({ error }, 400);
    if (cycleId && cycleId !== p.cycleId && !(await db.query.cycles.findFirst({ where: eq(cycles.id, cycleId) }))) {
      return c.json({ error: 'Ce cycle n’existe plus.' }, 400);
    }
    const change = recordChange(db, await runningWeek(db), c.get('email'), id, p, { status, format: p.format });
    await db.batch([
      db.update(projects).set({ status, cycleId, updatedAt: now() }).where(eq(projects.id, id)),
      ...change,
    ]);
    const [updated] = await fullProjects(db, [id]);
    return c.json(updated);
  },
);

/** Turns a short topic into a bet to shape: the problem goes into the guide's template. */
app.post('/projects/:id/promote', async (c) => {
  const db = database(c);
  const id = c.req.param('id');
  const p = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!p) return c.json({ error: 'Projet introuvable.' }, 404);
  if (p.format !== 'short') return c.json({ error: 'Ce projet est déjà un pari.' }, 400);
  const email = c.get('email');
  const t = now();
  const change = recordChange(db, await runningWeek(db), email, id, p, { status: 'shaping', format: 'bet' });
  await db.batch([
    db
      .update(projects)
      .set({
        format: 'bet',
        owner: email,
        status: 'shaping',
        cycleId: null,
        pitch: promotedPitch(p.name, email, t.slice(0, 10), p.pitch),
        updatedAt: t,
      })
      .where(eq(projects.id, id)),
    ...change,
  ]);
  const [updated] = await fullProjects(db, [id]);
  return c.json(updated);
});

/* ---------- Pitch and attachments ---------- */

const attachmentKey = (projectId: string, id: string) => `projects/${projectId}/${id}`;
const attachmentUrl = (id: string) => `/api/attachments/${id}`;
const withUrl = (a: typeof attachments.$inferSelect) => ({ ...a, url: attachmentUrl(a.id) });

app.put(
  '/projects/:id/pitch',
  validate('json', z.object({ pitch: z.string().max(MAX_PITCH_LENGTH, 'Le pitch est trop long.') })),
  async (c) => {
    const db = database(c);
    const id = c.req.param('id');
    const updated = await db
      .update(projects)
      .set({ pitch: c.req.valid('json').pitch, updatedAt: now() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    if (!updated.length) return c.json({ error: 'Projet introuvable.' }, 404);
    const [p] = await fullProjects(db, [id]);
    return c.json(p);
  },
);

app.get('/projects/:id/attachments', async (c) => {
  const list = await database(c)
    .select()
    .from(attachments)
    .where(eq(attachments.projectId, c.req.param('id')))
    .orderBy(asc(attachments.createdAt));
  return c.json(list.map(withUrl));
});

app.post('/projects/:id/attachments', async (c) => {
  const db = database(c);
  const projectId = c.req.param('id');
  if (!(await db.query.projects.findFirst({ where: eq(projects.id, projectId) }))) {
    return c.json({ error: 'Projet introuvable.' }, 404);
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return c.json({ error: 'Aucun fichier reçu.' }, 400);
  if (file.size === 0) return c.json({ error: 'Le fichier est vide.' }, 400);
  if (file.size > MAX_ATTACHMENT_SIZE) return c.json({ error: 'Le fichier dépasse 10 Mo.' }, 400);

  const id = crypto.randomUUID();
  const contentType = file.type || 'application/octet-stream';
  const row = {
    id,
    projectId,
    filename: cleanFilename(file.name),
    contentType,
    size: file.size,
    createdAt: now(),
    createdBy: c.get('email'),
  };
  await c.env.ATTACHMENTS.put(attachmentKey(projectId, id), file.stream(), { httpMetadata: { contentType } });
  await db.insert(attachments).values(row);
  return c.json(withUrl(row), 201);
});

app.get('/attachments/:id', async (c) => {
  const a = await database(c).query.attachments.findFirst({ where: eq(attachments.id, c.req.param('id')) });
  if (!a) return c.json({ error: 'Fichier introuvable.' }, 404);
  const object = await c.env.ATTACHMENTS.get(attachmentKey(a.projectId, a.id));
  if (!object) return c.json({ error: 'Fichier introuvable.' }, 404);
  // Only images and PDFs are shown in the browser; everything else is
  // downloaded, so an uploaded file can never run on the site.
  const inline = isInline(a.contentType);
  const headers: Record<string, string> = {
    'Content-Type': inline ? a.contentType : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
    'Content-Length': String(a.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable',
  };
  // The browser's PDF viewer does not open in a sandboxed document.
  if (a.contentType !== 'application/pdf') headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  return new Response(object.body, { headers });
});

app.delete('/attachments/:id', async (c) => {
  const db = database(c);
  const a = await db.query.attachments.findFirst({ where: eq(attachments.id, c.req.param('id')) });
  if (!a) return c.json({ error: 'Fichier introuvable.' }, 404);
  // Also remove its links and images from the pitch, and return the updated project.
  const project = await db.query.projects.findFirst({ where: eq(projects.id, a.projectId) });
  const pitch = project ? removeAttachmentLinks(project.pitch, attachmentUrl(a.id)) : '';
  await db.batch([
    db.delete(attachments).where(eq(attachments.id, a.id)),
    ...(project && pitch !== project.pitch
      ? [db.update(projects).set({ pitch, updatedAt: now() }).where(eq(projects.id, project.id))]
      : []),
  ]);
  await c.env.ATTACHMENTS.delete(attachmentKey(a.projectId, a.id));
  const [p] = await fullProjects(db, [a.projectId]);
  return c.json(p ?? null);
});

/* ---------- Weekly review ---------- */

/**
 * The weekly review of the current cycle: its bets with their progress notes,
 * the short topics waiting for a decision, and those taken in the cycle.
 */
app.get('/weekly-review', async (c) => {
  const db = database(c);
  const today = toDay(new Date());
  const all = numberCycles(await db.select().from(cycles));
  // The weekly review only covers the current cycle.
  const cycle = currentCycle(all, today);
  const empty = { bets: [], shortTopics: { pending: [], current: [] }, announcements: [], summary: { bets: [], shortTopics: [] } };
  if (!cycle) return c.json({ cycle: null, week: null, next: nextCycle(all, today), ...empty });

  const ids = (
    await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        or(
          and(eq(projects.cycleId, cycle.id), inArray(projects.status, ['bet', 'shipped'])),
          and(eq(projects.format, 'short'), inArray(projects.status, ['received', 'waiting'])),
        ),
      )
  ).map((p) => p.id);
  const found = await fullProjects(db, ids);
  const betIds = found.filter((p) => p.format === 'bet').map((p) => p.id);
  const notes = betIds.length
    ? await db
        .select()
        .from(progressNotes)
        .where(and(eq(progressNotes.cycleId, cycle.id), inArray(progressNotes.projectId, betIds)))
    : [];
  const inCycle = (p: (typeof found)[number]) => p.cycleId === cycle.id && (p.status === 'bet' || p.status === 'shipped');
  const byStatus = (a: (typeof found)[number], b: (typeof found)[number]) =>
    a.status === b.status ? a.name.localeCompare(b.name, 'fr') : a.status === 'bet' ? -1 : 1;
  const week = weekOf(cycle, today)!;
  const weekAnnouncements = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.cycleId, cycle.id), eq(announcements.week, week)))
    .orderBy(asc(announcements.createdAt));
  const changes = await db
    .select({
      projectId: projectChanges.projectId,
      fromStatus: projectChanges.fromStatus,
      toStatus: projectChanges.toStatus,
      fromFormat: projectChanges.fromFormat,
      toFormat: projectChanges.toFormat,
      at: projectChanges.createdAt,
      name: projects.name,
      requester: projects.requester,
    })
    .from(projectChanges)
    .innerJoin(projects, eq(projects.id, projectChanges.projectId))
    .where(and(eq(projectChanges.cycleId, cycle.id), eq(projectChanges.week, week)));
  const cycleBets = found.filter((p) => p.format === 'bet' && inCycle(p)).sort(byStatus);
  const summary = weekSummary({
    bets: cycleBets.map((b) => ({
      id: b.id,
      name: b.name,
      note: notes.find((n) => n.projectId === b.id && n.week === week)?.text ?? null,
    })),
    changes,
  });
  return c.json({
    cycle,
    week,
    next: null,
    summary,
    bets: cycleBets.map((p) => ({ ...p, notes: notes.filter((n) => n.projectId === p.id).sort((a, b) => b.week - a.week) })),
    shortTopics: {
      // New topics first, then those put aside, oldest first.
      pending: found
        .filter((p) => p.format === 'short' && !inCycle(p))
        .sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === 'received' ? -1 : 1)),
      current: found.filter((p) => p.format === 'short' && inCycle(p)).sort(byStatus),
    },
    announcements: weekAnnouncements,
  });
});

/** Progress note of a bet for one week of the cycle; an empty text deletes it. */
app.put(
  '/projects/:id/notes/:cycleId/:week',
  validate('json', z.object({ text: z.string().trim().max(4000, 'La note est trop longue.') })),
  async (c) => {
    const db = database(c);
    const { id, cycleId } = c.req.param();
    const week = Number(c.req.param('week'));
    if (!Number.isInteger(week) || week < 1 || week > 4) return c.json({ error: 'Semaine invalide.' }, 400);
    const p = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    if (!p) return c.json({ error: 'Projet introuvable.' }, 404);
    if (p.cycleId !== cycleId) return c.json({ error: 'Ce projet n’est pas pris dans ce cycle.' }, 400);
    if (p.format !== 'bet') return c.json({ error: 'Les notes de suivi sont réservées aux paris.' }, 400);

    const { text } = c.req.valid('json');
    const key = and(eq(progressNotes.projectId, id), eq(progressNotes.cycleId, cycleId), eq(progressNotes.week, week));
    if (!text) {
      await db.delete(progressNotes).where(key);
      return c.json(null);
    }
    const t = now();
    const email = c.get('email');
    const [note] = await db
      .insert(progressNotes)
      .values({ id: crypto.randomUUID(), projectId: id, cycleId, week, text, createdAt: t, createdBy: email, updatedAt: t, updatedBy: email })
      .onConflictDoUpdate({
        target: [progressNotes.projectId, progressNotes.cycleId, progressNotes.week],
        set: { text, updatedAt: t, updatedBy: email },
      })
      .returning();
    return c.json(note);
  },
);

/* ---------- Announcements ---------- */

const announcementBody = z.object({
  text: z.string().trim().min(1, 'L’info est vide.').max(2000, 'L’info est trop longue.'),
});

/** Adds an announcement to the current week of the current cycle. */
app.post('/announcements', validate('json', announcementBody), async (c) => {
  const db = database(c);
  const today = toDay(new Date());
  const cycle = currentCycle(await db.select().from(cycles), today);
  if (!cycle) return c.json({ error: 'Aucun cycle en cours : pas de point hebdo où diffuser cette info.' }, 409);
  const t = now();
  const email = c.get('email');
  const [a] = await db
    .insert(announcements)
    .values({
      id: crypto.randomUUID(),
      cycleId: cycle.id,
      week: weekOf(cycle, today)!,
      text: c.req.valid('json').text,
      createdAt: t,
      createdBy: email,
      updatedAt: t,
      updatedBy: email,
    })
    .returning();
  return c.json(a, 201);
});

app.patch('/announcements/:id', validate('json', announcementBody), async (c) => {
  const [a] = await database(c)
    .update(announcements)
    .set({ text: c.req.valid('json').text, updatedAt: now(), updatedBy: c.get('email') })
    .where(eq(announcements.id, c.req.param('id')))
    .returning();
  return a ? c.json(a) : c.json({ error: 'Info introuvable.' }, 404);
});

app.delete('/announcements/:id', async (c) => {
  await database(c).delete(announcements).where(eq(announcements.id, c.req.param('id')));
  return c.body(null, 204);
});

/* ---------- Decision log ---------- */

/**
 * The decision log of a quarter: each started week of its cycles, most recent first,
 * with the decisions, progress notes and announcements of that weekly review.
 * Decisions taken between two cycles are listed apart, by date.
 */
app.get('/log/:quarterId', async (c) => {
  const db = database(c);
  const q = await db.query.quarters.findFirst({ where: eq(quarters.id, c.req.param('quarterId')) });
  if (!q) return c.json({ error: 'Trimestre introuvable.' }, 404);
  const qCycles = numberCycles(await db.select().from(cycles).where(eq(cycles.quarterId, q.id)));
  const cycleIds = qCycles.map((x) => x.id);

  const changeColumns = {
    id: projectChanges.id,
    projectId: projectChanges.projectId,
    cycleId: projectChanges.cycleId,
    week: projectChanges.week,
    fromStatus: projectChanges.fromStatus,
    toStatus: projectChanges.toStatus,
    fromFormat: projectChanges.fromFormat,
    toFormat: projectChanges.toFormat,
    at: projectChanges.createdAt,
    by: projectChanges.createdBy,
    name: projects.name,
    requester: projects.requester,
  };
  const inCycles = cycleIds.length ? inArray(projectChanges.cycleId, cycleIds) : undefined;
  const between = and(
    isNull(projectChanges.cycleId),
    gte(projectChanges.createdAt, q.startsOn),
    // Dates are ISO strings: the whole last day is before the day after.
    lte(projectChanges.createdAt, `${q.endsOn}T23:59:59.999Z`),
  );
  const changes = await db
    .select(changeColumns)
    .from(projectChanges)
    .innerJoin(projects, eq(projects.id, projectChanges.projectId))
    .where(inCycles ? or(inCycles, between) : between)
    .orderBy(asc(projectChanges.createdAt));
  const decisions = changes.flatMap(({ fromStatus, toStatus, fromFormat, toFormat, ...rest }) => {
    const text = logDecision({ fromStatus, toStatus, fromFormat, toFormat });
    return text ? [{ ...rest, format: toFormat, text }] : [];
  });

  const notes = cycleIds.length
    ? await db
        .select({
          id: progressNotes.id,
          projectId: progressNotes.projectId,
          cycleId: progressNotes.cycleId,
          week: progressNotes.week,
          text: progressNotes.text,
          updatedAt: progressNotes.updatedAt,
          updatedBy: progressNotes.updatedBy,
          name: projects.name,
        })
        .from(progressNotes)
        .innerJoin(projects, eq(projects.id, progressNotes.projectId))
        .where(inArray(progressNotes.cycleId, cycleIds))
    : [];
  const infos = cycleIds.length
    ? await db.select().from(announcements).where(inArray(announcements.cycleId, cycleIds)).orderBy(asc(announcements.createdAt))
    : [];

  const inWeek = (w: { cycleId: string; week: number }) => (x: { cycleId: string | null; week: number | null }) =>
    x.cycleId === w.cycleId && x.week === w.week;
  return c.json({
    weeks: logWeeks(qCycles, toDay(new Date())).map((w) => ({
      ...w,
      decisions: decisions.filter(inWeek(w)),
      notes: notes.filter(inWeek(w)).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      announcements: infos.filter(inWeek(w)),
    })),
    // Decisions dated in no cycle, most recent first
    outside: decisions.filter((d) => d.cycleId === null).reverse(),
  });
});

app.all('*', (c) => c.json({ error: 'Route inconnue.' }, 404));

export default app;
