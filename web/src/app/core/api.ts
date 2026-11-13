import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Objectif {
  id: string;
  trimestreId: string;
  titre: string;
  description: string;
  creeLe: string;
  creePar: string;
}

export interface Cycle {
  id: string;
  trimestreId: string;
  numero: number;
  debut: string;
  fin: string;
}

export interface Trimestre {
  id: string;
  annee: number;
  numero: number;
  debut: string;
  fin: string;
  objectifs: Objectif[];
  cycles: Cycle[];
  /** Fourni par le détail d'un trimestre : date proposée pour le prochain cycle */
  prochainDebut?: string;
}

export const STATUTS = {
  recu: 'Reçu',
  shaping: 'En shaping',
  pret: 'Pitch prêt',
  attente: 'Attend prochain cycle',
  mise: 'Misé',
  livre: 'Livré',
  ecarte: 'Écarté',
} as const;
export type Statut = keyof typeof STATUTS;
export const STATUTS_AVEC_CYCLE: Statut[] = ['mise', 'livre'];

export interface Projet {
  id: string;
  nom: string;
  owner: string;
  statut: Statut;
  cycleId: string | null;
  objectifIds: string[];
  cycle: { id: string; numero: number; trimestreId: string; debut: string; fin: string } | null;
  /** Pitch en markdown */
  pitch: string;
  creeLe: string;
  creePar: string;
  majLe: string;
}

export interface ProjetSaisi {
  nom: string;
  owner: string;
  statut: Statut;
  cycleId: string | null;
  objectifIds: string[];
  /** À la création seulement */
  pitch?: string;
}

export interface Fichier {
  id: string;
  projetId: string;
  nom: string;
  type: string;
  taille: number;
  url: string;
  creeLe: string;
  creePar: string;
}

export const TAILLE_MAX_FICHIER = 10 * 1024 * 1024;

export const MAX_OBJECTIFS = 2;
export const MAX_CYCLES = 3;

/** Message d'erreur lisible, tiré de la réponse de l'API */
export function messageErreur(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Le serveur ne répond pas. Vérifiez votre connexion.';
    return e.error?.erreur ?? 'Une erreur est survenue.';
  }
  return 'Une erreur est survenue.';
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  moi() {
    return firstValueFrom(this.http.get<{ email: string }>('/api/moi'));
  }
  trimestres() {
    return firstValueFrom(this.http.get<Trimestre[]>('/api/trimestres'));
  }
  trimestre(id: string) {
    return firstValueFrom(this.http.get<Trimestre>(`/api/trimestres/${id}`));
  }
  creerTrimestre(annee: number, numero: number) {
    return firstValueFrom(this.http.post<Trimestre>('/api/trimestres', { annee, numero }));
  }
  supprimerTrimestre(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/trimestres/${id}`));
  }
  ajouterObjectif(trimestreId: string, titre: string, description: string) {
    return firstValueFrom(this.http.post<Trimestre>(`/api/trimestres/${trimestreId}/objectifs`, { titre, description }));
  }
  modifierObjectif(id: string, titre: string, description: string) {
    return firstValueFrom(this.http.patch<Trimestre>(`/api/objectifs/${id}`, { titre, description }));
  }
  supprimerObjectif(id: string) {
    return firstValueFrom(this.http.delete<Trimestre>(`/api/objectifs/${id}`));
  }
  ajouterCycle(trimestreId: string, debut: string) {
    return firstValueFrom(this.http.post<Trimestre>(`/api/trimestres/${trimestreId}/cycles`, { debut }));
  }
  modifierCycle(id: string, debut: string) {
    return firstValueFrom(this.http.patch<Trimestre>(`/api/cycles/${id}`, { debut }));
  }
  supprimerCycle(id: string) {
    return firstValueFrom(this.http.delete<Trimestre>(`/api/cycles/${id}`));
  }

  projets() {
    return firstValueFrom(this.http.get<Projet[]>('/api/projets'));
  }
  projet(id: string) {
    return firstValueFrom(this.http.get<Projet>(`/api/projets/${id}`));
  }
  creerProjet(p: ProjetSaisi) {
    return firstValueFrom(this.http.post<Projet>('/api/projets', p));
  }
  modifierProjet(id: string, p: ProjetSaisi) {
    return firstValueFrom(this.http.patch<Projet>(`/api/projets/${id}`, p));
  }
  supprimerProjet(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/projets/${id}`));
  }

  modelePitch() {
    return firstValueFrom(this.http.get<{ pitch: string }>('/api/pitch/modele'));
  }
  enregistrerPitch(id: string, pitch: string) {
    return firstValueFrom(this.http.put<Projet>(`/api/projets/${id}/pitch`, { pitch }));
  }
  fichiers(projetId: string) {
    return firstValueFrom(this.http.get<Fichier[]>(`/api/projets/${projetId}/fichiers`));
  }
  envoyerFichier(projetId: string, fichier: File) {
    const form = new FormData();
    form.append('fichier', fichier, fichier.name);
    return firstValueFrom(this.http.post<Fichier>(`/api/projets/${projetId}/fichiers`, form));
  }
  supprimerFichier(id: string) {
    return firstValueFrom(this.http.delete<Projet | null>(`/api/fichiers/${id}`));
  }
}
