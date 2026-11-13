// Business rules of the Petit Poucet method, independent from the database.
// A quarter has 1 or 2 goals and at most 3 cycles of 4 weeks.
// Error messages are user-facing, hence in French.

export const MAX_GOALS = 2;
export const MAX_CYCLES = 3;
export const CYCLE_LENGTH_DAYS = 28;

export type Day = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, '0');

export function toDay(d: Date): Day {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function fromDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(day: Day, n: number): Day {
  const d = fromDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return toDay(fromDay(day)) === day;
}

export function quarterId(year: number, number: number): string {
  return `${year}-Q${number}`;
}

/** First and last day of a calendar quarter. */
export function quarterBounds(year: number, number: number): { startsOn: Day; endsOn: Day } {
  const start = new Date(Date.UTC(year, (number - 1) * 3, 1));
  const end = new Date(Date.UTC(year, number * 3, 0));
  return { startsOn: toDay(start), endsOn: toDay(end) };
}

/** The Monday on or after a date: cycles start on a Monday. */
export function nextMonday(day: Day): Day {
  const weekday = (fromDay(day).getUTCDay() + 6) % 7; // 0 = Monday
  return weekday === 0 ? day : addDays(day, 7 - weekday);
}

export function cycleEnd(startsOn: Day): Day {
  return addDays(startsOn, CYCLE_LENGTH_DAYS - 1);
}

export interface ExistingCycle {
  id: string;
  startsOn: Day;
  endsOn: Day;
}

/** Suggested start date for the quarter's next cycle. */
export function suggestedStart(quarter: { startsOn: Day }, cycles: ExistingCycle[]): Day {
  if (!cycles.length) return nextMonday(quarter.startsOn);
  const last = [...cycles].sort((a, b) => a.endsOn.localeCompare(b.endsOn)).at(-1)!;
  return addDays(last.endsOn, 1);
}

/** Checks that a cycle fits in the quarter. Returns an error message, or null. */
export function checkCycle(
  quarter: { startsOn: Day; endsOn: Day },
  cycles: ExistingCycle[],
  startsOn: Day,
  ignoreId?: string,
): string | null {
  if (!isValidDay(startsOn)) return 'La date de début est invalide.';
  const others = cycles.filter((c) => c.id !== ignoreId);
  if (!ignoreId && others.length >= MAX_CYCLES) return `Un trimestre compte au plus ${MAX_CYCLES} cycles.`;
  if (startsOn < quarter.startsOn || startsOn > quarter.endsOn) return 'Le cycle doit commencer pendant le trimestre.';
  if (fromDay(startsOn).getUTCDay() !== 1) return 'Un cycle commence un lundi.';
  const endsOn = cycleEnd(startsOn);
  if (others.some((c) => startsOn <= c.endsOn && endsOn >= c.startsOn)) return 'Ce cycle chevauche un cycle existant.';
  return null;
}

/** Cycles are numbered in chronological order. */
export function numberCycles<T extends { startsOn: Day }>(cycles: T[]): (T & { number: number })[] {
  return [...cycles].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).map((c, i) => ({ ...c, number: i + 1 }));
}

/* ---------- Projects ---------- */

export const PROJECT_STATUSES = ['received', 'shaping', 'ready', 'waiting', 'bet', 'shipped', 'dropped'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Statuses for which the project must belong to a cycle */
export const STATUSES_WITH_CYCLE: readonly ProjectStatus[] = ['bet', 'shipped'];

/** A bet goes through shaping and a long pitch; a short topic is decided at the weekly review. */
export const PROJECT_FORMATS = ['bet', 'short'] as const;
export type ProjectFormat = (typeof PROJECT_FORMATS)[number];

/** Statuses a short topic can take: no shaping, no long pitch */
export const SHORT_STATUSES: readonly ProjectStatus[] = ['received', 'waiting', 'bet', 'shipped', 'dropped'];

export function checkProject(p: {
  format?: ProjectFormat;
  status: ProjectStatus;
  cycleId: string | null;
  requester?: string;
}): string | null {
  if (STATUSES_WITH_CYCLE.includes(p.status) && !p.cycleId) {
    return p.format === 'short'
      ? 'Un sujet court pris ou livré doit être rattaché à un cycle.'
      : 'Un projet misé ou livré doit être rattaché à un cycle.';
  }
  if (p.format === 'short') {
    if (!SHORT_STATUSES.includes(p.status)) return 'Un sujet court ne passe pas par le shaping : faites-en un pari.';
    if (!p.requester?.trim()) return 'Indiquez le demandeur du sujet court.';
  }
  return null;
}

/** The owner is an address of the allowed domain */
export function checkOwner(owner: string, domain: string): string | null {
  const o = owner.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(o)) return 'L’owner doit être une adresse e-mail.';
  if (!o.endsWith('@' + domain.toLowerCase())) return `L’owner doit avoir une adresse @${domain}.`;
  return null;
}

/* ---------- Pitch ---------- */

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_PITCH_LENGTH = 100_000;
/** Template title while the project has no name */
export const TEMPLATE_TITLE = '[Titre court du sujet]';

/** Template from the "Rédiger un pitch" guide, filled with the project name, author and date. */
export function pitchTemplate(name: string, author: string, day: Day): string {
  const [y, m, d] = day.split('-');
  return `# ${name}

Appétit : [1 à 4 semaines]
Rédigé par : ${author} · Date : ${d}/${m}/${y}

## Problème
[Situation vécue, en 3 à 5 phrases.]
- Qui est touché :
- Combien / à quelle fréquence :
- Source du signal :

## Solution esquissée
[Éléments clés et parcours principal, à gros traits.]

## Pièges identifiés
- [Piège] → [décision prise]

## Hors périmètre
-

## Comment on saura que c’est réussi
-
`;
}

/** Long pitch of a short topic turned into a bet: the guide's template, with the problem already written. */
export function promotedPitch(name: string, author: string, day: Day, problem: string): string {
  const template = pitchTemplate(name, author, day);
  const text = problem.trim();
  return text ? template.replace('[Situation vécue, en 3 à 5 phrases.]', text) : template;
}

/** Types served inline in the browser; everything else is downloaded. */
const INLINE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

export function isInline(contentType: string): boolean {
  return INLINE_TYPES.includes(contentType);
}

/** File name without path or control characters, 200 characters at most. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (clean || 'fichier').slice(0, 200);
}

/** Removes from the pitch the links and images pointing to a deleted attachment. */
export function removeAttachmentLinks(pitch: string, url: string): string {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return pitch
    .replace(new RegExp(`^[ \\t]*!?\\[[^\\]\\n]*\\]\\(${escaped}\\)[ \\t]*\\n?`, 'gm'), '')
    .replace(new RegExp(`!?\\[[^\\]\\n]*\\]\\(${escaped}\\)`, 'g'), '');
}

/* ---------- Weekly review ---------- */

/** Week 1 to 4 of the cycle for a given day, or null outside the cycle. */
export function weekOf(cycle: { startsOn: Day; endsOn: Day }, day: Day): number | null {
  if (day < cycle.startsOn || day > cycle.endsOn) return null;
  const days = Math.round((fromDay(day).getTime() - fromDay(cycle.startsOn).getTime()) / 86_400_000);
  return Math.min(4, Math.floor(days / 7) + 1);
}

/** The cycle running on that day, or null. */
export function currentCycle<T extends { startsOn: Day; endsOn: Day }>(cycles: T[], day: Day): T | null {
  return cycles.find((c) => c.startsOn <= day && day <= c.endsOn) ?? null;
}

/** The next cycle starting after that day, or null. */
export function nextCycle<T extends { startsOn: Day }>(cycles: T[], day: Day): T | null {
  return [...cycles].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).find((c) => c.startsOn > day) ?? null;
}

/* ---------- Week summary ---------- */

export interface StatusChange {
  /** null when the project was just created */
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus;
  fromFormat: ProjectFormat | null;
  toFormat: ProjectFormat;
}

/** What a status change means, in a few French words, or null when it is not worth sharing. */
export function describeChange(e: StatusChange): string | null {
  if (e.fromStatus === null) return e.toFormat === 'short' ? 'nouveau sujet posé' : null;
  if (e.fromFormat === 'short' && e.toFormat === 'bet') return 'devient un pari, en shaping';
  if (e.fromStatus === e.toStatus) return null;
  const short = e.toFormat === 'short';
  switch (e.toStatus) {
    case 'shipped':
      return 'livré';
    case 'bet':
      if (e.fromStatus === 'shipped') return 'remis en cours';
      return short ? 'pris dans le cycle' : 'misé sur le cycle';
    case 'waiting':
      return short ? 'pas maintenant' : 'attend le prochain cycle';
    case 'dropped':
      return 'écarté';
    case 'shaping':
      return 'passe en shaping';
    case 'ready':
      return 'pitch prêt';
    case 'received':
      return null;
  }
}

/**
 * Lines shared at the end of the weekly review, built from what was said during it:
 * the progress notes of the bets, and the week's decisions on bets and short topics.
 * For each project, only its latest change of the week counts.
 */
export function weekSummary(input: {
  bets: { id: string; name: string; note: string | null }[];
  changes: (StatusChange & { projectId: string; name: string; requester: string; at: string })[];
}): { bets: string[]; shortTopics: string[] } {
  const latest = new Map<string, (typeof input.changes)[number]>();
  for (const c of [...input.changes].sort((a, b) => a.at.localeCompare(b.at))) latest.set(c.projectId, c);

  const bets: string[] = [];
  for (const b of input.bets) {
    const change = latest.get(b.id);
    const what = change ? describeChange(change) : null;
    latest.delete(b.id);
    const note = b.note?.trim();
    if (note && what) bets.push(`${b.name} (${what}) : ${note}`);
    else if (note) bets.push(`${b.name} : ${note}`);
    else if (what) bets.push(`${b.name} : ${what}`);
  }
  const shortTopics: string[] = [];
  for (const c of latest.values()) {
    const what = describeChange(c);
    if (!what) continue;
    const line = c.fromFormat === 'short' ? `${c.name} (demandé par ${c.requester}) : ${what}` : `${c.name} : ${what}`;
    (c.fromFormat === 'short' || c.toFormat === 'short' ? shortTopics : bets).push(line);
  }
  return { bets, shortTopics };
}
