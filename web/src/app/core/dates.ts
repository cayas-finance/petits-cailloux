// Dates manipulées en AAAA-MM-JJ, comme dans l'API.

const pad = (n: number) => String(n).padStart(2, '0');

export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function trimestreCourant(): { annee: number; numero: number } {
  const d = new Date();
  return { annee: d.getFullYear(), numero: Math.floor(d.getMonth() / 3) + 1 };
}

export function jourCourt(j: string): string {
  const [a, m, d] = j.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function jourLong(j: string): string {
  const [a, m, d] = j.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function estEnCours(p: { debut: string; fin: string }): boolean {
  const t = aujourdhui();
  return p.debut <= t && t <= p.fin;
}

/** Semaine 1 à 4 d'un cycle en cours, sinon null */
export function semaineDuCycle(c: { debut: string; fin: string }): number | null {
  if (!estEnCours(c)) return null;
  const [a, m, d] = c.debut.split('-').map(Number);
  const jours = Math.floor((Date.now() - new Date(a, m - 1, d).getTime()) / 86400000);
  return Math.min(4, Math.floor(jours / 7) + 1);
}

export const libelleTrimestre = (t: { annee: number; numero: number }) => `T${t.numero} ${t.annee}`;
