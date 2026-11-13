import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { PROJECT_FORMATS, PROJECT_STATUSES } from '../domain';

const created = {
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
};

export const quarters = sqliteTable(
  'quarters',
  {
    id: text('id').primaryKey(), // e.g. 2026-Q4
    year: integer('year').notNull(),
    number: integer('number').notNull(), // 1 to 4
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on').notNull(),
    ...created,
  },
  (t) => [uniqueIndex('quarters_year_number').on(t.year, t.number)],
);

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    quarterId: text('quarter_id')
      .notNull()
      .references(() => quarters.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    ...created,
  },
  (t) => [index('goals_quarter').on(t.quarterId)],
);

export const cycles = sqliteTable(
  'cycles',
  {
    id: text('id').primaryKey(),
    quarterId: text('quarter_id')
      .notNull()
      .references(() => quarters.id, { onDelete: 'cascade' }),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on').notNull(),
    ...created,
  },
  (t) => [index('cycles_quarter').on(t.quarterId)],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** Bet (shaping, long pitch) or short topic (decided at the weekly review) */
    format: text('format', { enum: PROJECT_FORMATS }).notNull().default('bet'),
    /** E-mail address of the person who owns the bet; short topics have none */
    owner: text('owner'),
    /** Who asked for it (free text: a person, a client…); required for a short topic */
    requester: text('requester').notNull().default(''),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('received'),
    /** Cycle the project is taken into; empty until it is bet on */
    cycleId: text('cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
    /** Markdown: the long pitch of a bet (guide's template), or the problem of a short topic */
    pitch: text('pitch').notNull().default(''),
    ...created,
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('projects_cycle').on(t.cycleId), index('projects_status').on(t.status)],
);

/** A project serves 0, 1 or several goals */
export const projectGoals = sqliteTable(
  'project_goals',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('project_goals_pk').on(t.projectId, t.goalId), index('project_goals_goal').on(t.goalId)],
);

/** Images and files attached to a pitch; content lives in R2 under projects/<projectId>/<id> */
export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    ...created,
  },
  (t) => [index('attachments_project').on(t.projectId)],
);

/** Progress note on a bet, one per week of the cycle (weekly review) */
export const progressNotes = sqliteTable(
  'progress_notes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    /** Week 1 to 4 of the cycle */
    week: integer('week').notNull(),
    text: text('text').notNull(),
    ...created,
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => [
    uniqueIndex('progress_notes_week').on(t.projectId, t.cycleId, t.week),
    index('progress_notes_cycle').on(t.cycleId),
  ],
);
