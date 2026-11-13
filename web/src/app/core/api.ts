import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Goal {
  id: string;
  quarterId: string;
  title: string;
  description: string;
  createdAt: string;
  createdBy: string;
}

export interface Cycle {
  id: string;
  quarterId: string;
  number: number;
  startsOn: string;
  endsOn: string;
}

export interface Quarter {
  id: string;
  year: number;
  number: number;
  startsOn: string;
  endsOn: string;
  goals: Goal[];
  cycles: Cycle[];
  /** Given by the quarter detail: suggested start date for the next cycle */
  nextStart?: string;
}

/** Project statuses, with their French labels */
export const STATUSES = {
  received: 'Reçu',
  shaping: 'En shaping',
  ready: 'Pitch prêt',
  waiting: 'Attend prochain cycle',
  bet: 'Misé',
  shipped: 'Livré',
  dropped: 'Écarté',
} as const;
export type Status = keyof typeof STATUSES;
export const STATUSES_WITH_CYCLE: Status[] = ['bet', 'shipped'];

export interface Project {
  id: string;
  name: string;
  owner: string;
  status: Status;
  cycleId: string | null;
  goalIds: string[];
  cycle: { id: string; number: number; quarterId: string; startsOn: string; endsOn: string } | null;
  /** Pitch in markdown */
  pitch: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  owner: string;
  status: Status;
  cycleId: string | null;
  goalIds: string[];
  /** On creation only */
  pitch?: string;
}

export interface Attachment {
  id: string;
  projectId: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  createdAt: string;
  createdBy: string;
}

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export interface ProgressNote {
  id: string;
  projectId: string;
  cycleId: string;
  week: number;
  text: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Bet extends Project {
  notes: ProgressNote[];
}

export interface WeeklyReview {
  cycle: Cycle | null;
  /** Week 1 to 4 when the cycle is running, otherwise null */
  week: number | null;
  /** When no cycle is running: the next one to start */
  next: Cycle | null;
  bets: Bet[];
}

export const MAX_GOALS = 2;
export const MAX_CYCLES = 3;

/** User-facing error message, taken from the API response */
export function errorMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Le serveur ne répond pas. Vérifiez votre connexion.';
    return e.error?.error ?? 'Une erreur est survenue.';
  }
  return 'Une erreur est survenue.';
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  me() {
    return firstValueFrom(this.http.get<{ email: string }>('/api/me'));
  }

  quarters() {
    return firstValueFrom(this.http.get<Quarter[]>('/api/quarters'));
  }
  quarter(id: string) {
    return firstValueFrom(this.http.get<Quarter>(`/api/quarters/${id}`));
  }
  createQuarter(year: number, number: number) {
    return firstValueFrom(this.http.post<Quarter>('/api/quarters', { year, number }));
  }
  deleteQuarter(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/quarters/${id}`));
  }
  addGoal(quarterId: string, title: string, description: string) {
    return firstValueFrom(this.http.post<Quarter>(`/api/quarters/${quarterId}/goals`, { title, description }));
  }
  updateGoal(id: string, title: string, description: string) {
    return firstValueFrom(this.http.patch<Quarter>(`/api/goals/${id}`, { title, description }));
  }
  deleteGoal(id: string) {
    return firstValueFrom(this.http.delete<Quarter>(`/api/goals/${id}`));
  }
  addCycle(quarterId: string, startsOn: string) {
    return firstValueFrom(this.http.post<Quarter>(`/api/quarters/${quarterId}/cycles`, { startsOn }));
  }
  updateCycle(id: string, startsOn: string) {
    return firstValueFrom(this.http.patch<Quarter>(`/api/cycles/${id}`, { startsOn }));
  }
  deleteCycle(id: string) {
    return firstValueFrom(this.http.delete<Quarter>(`/api/cycles/${id}`));
  }

  projects() {
    return firstValueFrom(this.http.get<Project[]>('/api/projects'));
  }
  project(id: string) {
    return firstValueFrom(this.http.get<Project>(`/api/projects/${id}`));
  }
  createProject(p: ProjectInput) {
    return firstValueFrom(this.http.post<Project>('/api/projects', p));
  }
  updateProject(id: string, p: ProjectInput) {
    return firstValueFrom(this.http.patch<Project>(`/api/projects/${id}`, p));
  }
  deleteProject(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/projects/${id}`));
  }
  setStatus(projectId: string, status: Status) {
    return firstValueFrom(this.http.patch<Project>(`/api/projects/${projectId}/status`, { status }));
  }

  pitchTemplate() {
    return firstValueFrom(this.http.get<{ pitch: string }>('/api/pitch/template'));
  }
  savePitch(id: string, pitch: string) {
    return firstValueFrom(this.http.put<Project>(`/api/projects/${id}/pitch`, { pitch }));
  }
  attachments(projectId: string) {
    return firstValueFrom(this.http.get<Attachment[]>(`/api/projects/${projectId}/attachments`));
  }
  uploadAttachment(projectId: string, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(this.http.post<Attachment>(`/api/projects/${projectId}/attachments`, form));
  }
  deleteAttachment(id: string) {
    return firstValueFrom(this.http.delete<Project | null>(`/api/attachments/${id}`));
  }

  weeklyReview() {
    return firstValueFrom(this.http.get<WeeklyReview>('/api/weekly-review'));
  }
  saveNote(projectId: string, cycleId: string, week: number, text: string) {
    return firstValueFrom(
      this.http.put<ProgressNote | null>(`/api/projects/${projectId}/notes/${cycleId}/${week}`, { text }),
    );
  }
}
