// Dates are handled as YYYY-MM-DD, like in the API. Labels are in French.

const pad = (n: number) => String(n).padStart(2, '0');

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentQuarter(): { year: number; number: number } {
  const d = new Date();
  return { year: d.getFullYear(), number: Math.floor(d.getMonth() / 3) + 1 };
}

export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function isRunning(p: { startsOn: string; endsOn: string }): boolean {
  const t = today();
  return p.startsOn <= t && t <= p.endsOn;
}

/** Week 1 to 4 of a running cycle, otherwise null */
export function cycleWeek(c: { startsOn: string; endsOn: string }): number | null {
  if (!isRunning(c)) return null;
  const [y, m, d] = c.startsOn.split('-').map(Number);
  const days = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
  return Math.min(4, Math.floor(days / 7) + 1);
}

/** "T4 2026": French label of a quarter */
export const quarterLabel = (q: { year: number; number: number }) => `T${q.number} ${q.year}`;
