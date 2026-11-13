import type { ZardBadgeTypeVariants } from '@/shared/components/badge';
import type { Statut } from '../core/api';

export function typeBadgeStatut(s: Statut): ZardBadgeTypeVariants {
  if (s === 'mise') return 'default';
  if (s === 'livre') return 'outline';
  if (s === 'ecarte') return 'destructive';
  return 'secondary';
}

/** « T4 2026 · cycle 1 » à partir de l'id de trimestre (ex. 2026-T4). */
export function libelleCycle(c: { trimestreId: string; numero: number }): string {
  const [annee, t] = c.trimestreId.split('-');
  return `${t} ${annee} · cycle ${c.numero}`;
}
