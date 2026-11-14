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

/** A bet goes through shaping and a long pitch; a short topic is decided at the weekly review. */
export const FORMATS = { bet: 'Pari', short: 'Sujet court' } as const;
export type Format = keyof typeof FORMATS;
/** Statuses of a short topic, with their labels */
export const SHORT_STATUSES: Partial<Record<Status, string>> = {
  received: 'Reçu',
  waiting: 'Pas maintenant',
  bet: 'Pris',
  shipped: 'Livré',
  dropped: 'Écarté',
};

/** Label of a project's status, depending on its format */
export function statusLabel(p: { format: Format; status: Status }): string {
  return (p.format === 'short' ? SHORT_STATUSES[p.status] : undefined) ?? STATUSES[p.status];
}

export interface Project {
  id: string;
  name: string;
  format: Format;
  /** Bets only */
  owner: string | null;
  requester: string;
  status: Status;
  cycleId: string | null;
  goalIds: string[];
  cycle: { id: string; number: number; quarterId: string; startsOn: string; endsOn: string } | null;
  /** Markdown: long pitch of a bet, or problem of a short topic */
  pitch: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  format: Format;
  owner?: string;
  requester: string;
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

/** Information to share with the team, given at the weekly review */
export interface Announcement {
  id: string;
  cycleId: string;
  week: number;
  text: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** A decision of the log: a change of status or format, dated and signed */
export interface LogDecision {
  id: string;
  projectId: string;
  cycleId: string | null;
  week: number | null;
  name: string;
  format: Format;
  requester: string;
  /** What was decided, in French */
  text: string;
  at: string;
  by: string;
}

export interface LogNote {
  id: string;
  projectId: string;
  cycleId: string;
  week: number;
  name: string;
  text: string;
  updatedAt: string;
  updatedBy: string;
}

/** One past weekly review of the decision log */
export interface LogWeek {
  cycleId: string;
  cycle: number;
  week: number;
  /** Monday of that week */
  startsOn: string;
  decisions: LogDecision[];
  notes: LogNote[];
  announcements: Announcement[];
}

export interface DecisionLog {
  /** Most recent first */
  weeks: LogWeek[];
  /** Decisions taken between two cycles, most recent first */
  outside: LogDecision[];
}

export interface WeeklyReview {
  cycle: Cycle | null;
  /** Week 1 to 4 when the cycle is running, otherwise null */
  week: number | null;
  /** When no cycle is running: the next one to start */
  next: Cycle | null;
  bets: Bet[];
  shortTopics: {
    /** Waiting for a decision: new, or put aside */
    pending: Project[];
    /** Taken in the current cycle */
    current: Project[];
  };
  /** Announcements of the current week, added by hand */
  announcements: Announcement[];
  /** Lines built from the review: notes of the bets, decisions of the week */
  summary: { bets: string[]; shortTopics: string[] };
}

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
  /** Changes the status, and the cycle when given */
  setStatus(projectId: string, status: Status, cycleId?: string | null) {
    return firstValueFrom(this.http.patch<Project>(`/api/projects/${projectId}/status`, { status, cycleId }));
  }
  /** Turns a short topic into a bet to shape */
  promote(projectId: string) {
    return firstValueFrom(this.http.post<Project>(`/api/projects/${projectId}/promote`, {}));
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

  log(quarterId: string) {
    return firstValueFrom(this.http.get<DecisionLog>(`/api/log/${quarterId}`));
  }

  weeklyReview() {
    return firstValueFrom(this.http.get<WeeklyReview>('/api/weekly-review'));
  }
  addAnnouncement(text: string) {
    return firstValueFrom(this.http.post<Announcement>('/api/announcements', { text }));
  }
  updateAnnouncement(id: string, text: string) {
    return firstValueFrom(this.http.patch<Announcement>(`/api/announcements/${id}`, { text }));
  }
  deleteAnnouncement(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/announcements/${id}`));
  }
  saveNote(projectId: string, cycleId: string, week: number, text: string) {
    return firstValueFrom(
      this.http.put<ProgressNote | null>(`/api/projects/${projectId}/notes/${cycleId}/${week}`, { text }),
    );
  }
}
