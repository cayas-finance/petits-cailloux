import type { ZardBadgeTypeVariants } from '@/shared/components/badge';
import type { Status } from '../core/api';

export function statusBadgeType(s: Status): ZardBadgeTypeVariants {
  if (s === 'bet') return 'default';
  if (s === 'shipped') return 'outline';
  if (s === 'dropped') return 'destructive';
  return 'secondary';
}

/** Pages that open a project and get a back link from it (?from=…) */
export const BACK_LINKS: Record<string, { url: string; label: string }> = {
  'weekly-review': { url: '/weekly-review', label: 'Point hebdo' },
  roadmap: { url: '/roadmap', label: 'Roadmap' },
};

/** "T4 2026 · cycle 1" from the quarter id (e.g. 2026-Q4). */
export function cycleLabel(c: { quarterId: string; number: number }): string {
  const [year, q] = c.quarterId.split('-');
  return `T${q.slice(1)} ${year} · cycle ${c.number}`;
}
