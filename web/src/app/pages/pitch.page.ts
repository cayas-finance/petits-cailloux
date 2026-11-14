import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Attachment, FORMATS, Project, Quarter, errorMessage, statusLabel } from '../core/api';
import { shortDay } from '../core/dates';
import { PitchViewComponent } from '../pitch/pitch-view.component';
import { BACK_LINKS, cycleLabel, statusBadgeType } from './project-labels';

/** The pitch alone, read-only: to read it before the betting table or to share it. */
@Component({
  selector: 'app-pitch',
  imports: [RouterLink, ZardButtonComponent, ZardBadgeComponent, PitchViewComponent],
  template: `
    @if (project(); as p) {
      <div class="mx-auto flex max-w-3xl flex-col gap-6">
        <div class="flex flex-wrap items-center justify-between gap-2 print:hidden">
          @if (back(); as b) {
            <a [routerLink]="b.url" class="text-sm text-muted-foreground hover:text-foreground">← {{ b.label }}</a>
          } @else {
            <a [routerLink]="['/projects', p.id]" class="text-sm text-muted-foreground hover:text-foreground">← Fiche du projet</a>
          }
          <div class="flex gap-2">
            <button z-button zType="outline" zSize="sm" (click)="print()">Imprimer</button>
            <a z-button zSize="sm" [routerLink]="['/projects', p.id]" [queryParams]="{ pitch: 'edit', from: from() }">Modifier le pitch</a>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-4 text-sm text-muted-foreground">
          <z-badge [zType]="badge(p.status)">{{ status(p) }}</z-badge>
          <span>{{ formats[p.format] }}</span>
          @if (p.owner) {
            <span>Owner : {{ p.owner }}</span>
          }
          @if (p.requester) {
            <span>Demandeur : {{ p.requester }}</span>
          }
          @if (p.cycle) {
            <span>{{ cycle(p.cycle) }} · {{ short(p.cycle.startsOn) }} → {{ short(p.cycle.endsOn) }}</span>
          }
          @if (goals().length) {
            <span>Objectifs : {{ goals().join(' · ') }}</span>
          } @else {
            <span>Aucun objectif rattaché</span>
          }
        </div>

        <article>
          @if (p.pitch.trim()) {
            @if (p.format === 'short') {
              <h1 class="mb-3 text-xl font-bold">{{ p.name }}</h1>
            }
            <app-pitch-view [markdown]="p.pitch" />
          } @else {
            <h1 class="text-xl font-bold">{{ p.name }}</h1>
            <p class="mt-4 text-sm text-muted-foreground">{{ p.format === 'short' ? 'Problème non décrit.' : 'Pas encore de pitch.' }}</p>
          }
        </article>

        @if (attachments().length) {
          <div class="flex flex-col gap-2 border-t pt-4 text-sm">
            <h2 class="font-medium">Fichiers joints</h2>
            <ul class="flex flex-col gap-1">
              @for (a of attachments(); track a.id) {
                <li><a [href]="a.url" target="_blank" rel="noopener" class="text-primary hover:underline">{{ a.filename }}</a></li>
              }
            </ul>
          </div>
        }
      </div>
    } @else {
      <p class="text-sm text-muted-foreground">Chargement…</p>
    }
  `,
})
export class PitchPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ZardSonnerService);

  readonly id = input.required<string>();
  /** ?from=weekly-review or roadmap: the back link returns to that page */
  readonly from = input<string>();
  protected readonly back = computed(() => BACK_LINKS[this.from() ?? '']);

  protected readonly project = signal<Project | null>(null);
  protected readonly attachments = signal<Attachment[]>([]);
  private readonly quarters = signal<Quarter[]>([]);

  protected readonly goals = computed(() => {
    const ids = this.project()?.goalIds ?? [];
    return this.quarters()
      .flatMap((q) => q.goals)
      .filter((g) => ids.includes(g.id))
      .map((g) => g.title);
  });

  protected readonly badge = statusBadgeType;
  protected readonly cycle = cycleLabel;
  protected readonly short = shortDay;
  protected readonly status = statusLabel;
  protected readonly formats = FORMATS;

  constructor() {
    effect(() => {
      this.load(this.id());
    });
  }

  private async load(id: string) {
    try {
      const [p, as, qs] = await Promise.all([this.api.project(id), this.api.attachments(id), this.api.quarters()]);
      this.quarters.set(qs);
      this.attachments.set(as);
      this.project.set(p);
      document.title = `${p.name} · Pitch`;
    } catch (e) {
      this.toast.error(errorMessage(e));
      await this.router.navigate(['/projects']);
    }
  }

  protected print() {
    window.print();
  }
}
