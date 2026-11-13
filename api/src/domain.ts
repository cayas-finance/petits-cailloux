// Règles métier de la méthode Petit Poucet, indépendantes de la base.
// Un trimestre porte 1 ou 2 objectifs et au plus 3 cycles de 4 semaines.

export const MAX_OBJECTIFS = 2;
export const MAX_CYCLES = 3;
export const DUREE_CYCLE_JOURS = 28;

export type Jour = string; // AAAA-MM-JJ

const pad = (n: number) => String(n).padStart(2, '0');

export function versJour(d: Date): Jour {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function depuisJour(j: Jour): Date {
  const [a, m, d] = j.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function ajouterJours(j: Jour, n: number): Jour {
  const d = depuisJour(j);
  d.setUTCDate(d.getUTCDate() + n);
  return versJour(d);
}

export function estJourValide(j: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return false;
  return versJour(depuisJour(j)) === j;
}

export function idTrimestre(annee: number, numero: number): string {
  return `${annee}-T${numero}`;
}

/** Premier et dernier jour d'un trimestre civil. */
export function bornesTrimestre(annee: number, numero: number): { debut: Jour; fin: Jour } {
  const debut = new Date(Date.UTC(annee, (numero - 1) * 3, 1));
  const fin = new Date(Date.UTC(annee, numero * 3, 0));
  return { debut: versJour(debut), fin: versJour(fin) };
}

/** Lundi qui suit (ou égale) une date : les cycles démarrent un lundi. */
export function lundiSuivant(j: Jour): Jour {
  const d = depuisJour(j);
  const jourSemaine = (d.getUTCDay() + 6) % 7; // 0 = lundi
  return jourSemaine === 0 ? j : ajouterJours(j, 7 - jourSemaine);
}

export function finCycle(debut: Jour): Jour {
  return ajouterJours(debut, DUREE_CYCLE_JOURS - 1);
}

export interface CycleExistant {
  id: string;
  debut: Jour;
  fin: Jour;
}

/** Date de début proposée pour le prochain cycle du trimestre. */
export function debutPropose(trimestre: { debut: Jour }, cycles: CycleExistant[]): Jour {
  if (!cycles.length) return lundiSuivant(trimestre.debut);
  const dernier = [...cycles].sort((a, b) => a.fin.localeCompare(b.fin)).at(-1)!;
  return ajouterJours(dernier.fin, 1);
}

/**
 * Vérifie qu'un cycle peut être placé dans le trimestre.
 * Renvoie un message d'erreur en français, ou null si tout va bien.
 */
export function verifierCycle(
  trimestre: { debut: Jour; fin: Jour },
  cycles: CycleExistant[],
  debut: Jour,
  ignorerId?: string,
): string | null {
  if (!estJourValide(debut)) return 'La date de début est invalide.';
  const autres = cycles.filter((c) => c.id !== ignorerId);
  if (!ignorerId && autres.length >= MAX_CYCLES) return `Un trimestre compte au plus ${MAX_CYCLES} cycles.`;
  if (debut < trimestre.debut || debut > trimestre.fin) return 'Le cycle doit commencer pendant le trimestre.';
  if (depuisJour(debut).getUTCDay() !== 1) return 'Un cycle commence un lundi.';
  const fin = finCycle(debut);
  const chevauche = autres.find((c) => debut <= c.fin && fin >= c.debut);
  if (chevauche) return 'Ce cycle chevauche un cycle existant.';
  return null;
}

/** Les cycles sont numérotés dans l'ordre chronologique du trimestre. */
export function numeroter<T extends { debut: Jour }>(cycles: T[]): (T & { numero: number })[] {
  return [...cycles].sort((a, b) => a.debut.localeCompare(b.debut)).map((c, i) => ({ ...c, numero: i + 1 }));
}

/* ---------- Projets ---------- */

export const LIBELLES_STATUT = {
  recu: 'Reçu',
  shaping: 'En shaping',
  pret: 'Pitch prêt',
  attente: 'Attend prochain cycle',
  mise: 'Misé',
  livre: 'Livré',
  ecarte: 'Écarté',
} as const;

/** Statuts pour lesquels le projet doit être rattaché à un cycle */
export const STATUTS_AVEC_CYCLE: readonly string[] = ['mise', 'livre'];

export function verifierProjet(p: { statut: string; cycleId: string | null }): string | null {
  if (STATUTS_AVEC_CYCLE.includes(p.statut) && !p.cycleId) {
    return 'Un projet misé ou livré doit être rattaché à un cycle.';
  }
  return null;
}

/** L'owner est une adresse du domaine autorisé */
export function verifierOwner(owner: string, domaine: string): string | null {
  const o = owner.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(o)) return 'L’owner doit être une adresse e-mail.';
  if (!o.endsWith('@' + domaine.toLowerCase())) return `L’owner doit avoir une adresse @${domaine}.`;
  return null;
}

/* ---------- Pitch ---------- */

/** Taille maximale d'un fichier joint au pitch */
export const TAILLE_MAX_FICHIER = 10 * 1024 * 1024;
export const TAILLE_MAX_PITCH = 100_000;
/** Titre du modèle tant que le projet n'a pas de nom */
export const TITRE_MODELE = '[Titre court du sujet]';

/** Modèle du guide « Rédiger un pitch », pré-rempli avec le nom du projet, l'auteur et la date. */
export function modelePitch(nom: string, auteur: string, jour: string): string {
  const [a, m, j] = jour.split('-');
  return `# ${nom}

Appétit : [1 à 4 semaines]
Rédigé par : ${auteur} · Date : ${j}/${m}/${a}

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

/** Types servis tels quels dans le navigateur ; tout le reste est téléchargé. */
const TYPES_AFFICHABLES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

export function estAffichable(type: string): boolean {
  return TYPES_AFFICHABLES.includes(type);
}

/** Nom de fichier sans chemin ni caractères de contrôle, 200 caractères au plus. */
export function nettoyerNomFichier(nom: string): string {
  const base = nom.split(/[\\/]/).pop() ?? '';
  const propre = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (propre || 'fichier').slice(0, 200);
}

/** Retire du pitch les liens et images qui pointent vers un fichier joint supprimé. */
export function retirerLiensFichier(pitch: string, url: string): string {
  const echappee = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return pitch
    .replace(new RegExp(`^[ \\t]*!?\\[[^\\]\\n]*\\]\\(${echappee}\\)[ \\t]*\\n?`, 'gm'), '')
    .replace(new RegExp(`!?\\[[^\\]\\n]*\\]\\(${echappee}\\)`, 'g'), '');
}

/* ---------- Point hebdo ---------- */

/** Semaine 1 à 4 du cycle pour un jour donné, ou null hors du cycle. */
export function semaineDe(cycle: { debut: Jour; fin: Jour }, jour: Jour): number | null {
  if (jour < cycle.debut || jour > cycle.fin) return null;
  const jours = Math.round((depuisJour(jour).getTime() - depuisJour(cycle.debut).getTime()) / 86_400_000);
  return Math.min(4, Math.floor(jours / 7) + 1);
}

/** Cycle en cours à cette date, sinon null. */
export function cycleEnCours<T extends { debut: Jour; fin: Jour }>(cycles: T[], jour: Jour): T | null {
  return cycles.find((c) => c.debut <= jour && jour <= c.fin) ?? null;
}

/** Prochain cycle à commencer après cette date, sinon null. */
export function prochainCycle<T extends { debut: Jour }>(cycles: T[], jour: Jour): T | null {
  return [...cycles].sort((a, b) => a.debut.localeCompare(b.debut)).find((c) => c.debut > jour) ?? null;
}
