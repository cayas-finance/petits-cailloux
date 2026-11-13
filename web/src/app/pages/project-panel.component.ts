import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { Api, Attachment, FORMATS, Project, Quarter, errorMessage, statusLabel } from '../core/api';
import { shortDay } from '../core/dates';
import { PitchViewComponent } from '../pitch/pitch-view.component';
import { cycleLabel, statusBadgeType } from './project-labels';

/**
 * A project shown in a side panel, read-only, so the weekly review stays in place.
 * The full page is one link away, with a way back to the weekly review.
 */
@Component({
  selector: 'app-project-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, RouterLink, ZardBadgeComponent, ZardButtonComponent, PitchViewComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="fixed inset-0 z-40 bg-black/30" aria-hidden="true" (click)="closed.emit()"></div>
    <aside
      class="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l bg-background shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-panel-title"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <header class="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div class="min-w-0">
          <h2 id="project-panel-title" class="text-lg font-bold">{{ project().name }}</h2>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <z-badge [zType]="badge(project().status)">{{ status(project()) }}</z-badge>
            <span>{{ formats[project().format] }}</span>
            @if (project().owner) {
              <span>Owner : {{ project().owner }}</span>
            }
            @if (project().requester) {
              <span>Demandeur : {{ project().requester }}</span>
            }
            @if (project().cycle; as c) {
              <span>{{ cycle(c) }} · {{ short(c.startsOn) }} → {{ short(c.endsOn) }}</span>
            }
          </div>
          @if (goals().length) {
            <p class="mt-1 text-sm text-muted-foreground">→ {{ goals().join(' · ') }}</p>
          }
        </div>
        <button z-button zType="ghost" zSize="sm" aria-label="Fermer" (click)="closed.emit()">✕</button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        @if (project().pitch.trim()) {
          <app-pitch-view [markdown]="project().pitch" />
        } @else {
          <p class="text-sm text-muted-foreground">
            {{ project().format === 'short' ? 'Problème non décrit.' : 'Pas encore de pitch.' }}
          </p>
        }
        @if (attachments().length) {
          <div class="mt-6 flex flex-col gap-2 border-t pt-4 text-sm">
            <h3 class="font-medium">Fichiers joints</h3>
            <ul class="flex flex-col gap-1">
              @for (a of attachments(); track a.id) {
                <li><a [href]="a.url" target="_blank" rel="noopener" class="text-primary hover:underline">{{ a.filename }}</a></li>
              }
            </ul>
          </div>
        }
        @if (error()) {
          <p class="mt-4 text-sm text-destructive">{{ error() }}</p>
        }
      </div>

      <footer class="flex flex-wrap gap-2 border-t px-5 py-3">
        <a z-button zType="outline" [routerLink]="['/projects', project().id]" [queryParams]="{ from: 'weekly-review' }">
          Ouvrir la fiche
        </a>
        <a z-button zType="ghost" [routerLink]="['/projects', project().id, 'pitch']" [queryParams]="{ from: 'weekly-review' }">
          {{ project().format === 'short' ? 'Lire le sujet seul' : 'Lire le pitch seul' }}
        </a>
      </footer>
    </aside>
  `,
})
export class ProjectPanelComponent {
  private readonly api = inject(Api);

  readonly project = input.required<Project>();
  /** Quarters already loaded by the page, to name the goals */
  readonly quarters = input<Quarter[]>([]);
  readonly closed = output<void>();

  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly error = signal('');

  protected readonly formats = FORMATS;
  protected readonly status = statusLabel;
  protected readonly badge = statusBadgeType;
  protected readonly cycle = cycleLabel;
  protected readonly short = shortDay;

  protected readonly goals = computed(() => {
    const ids = this.project().goalIds;
    return this.quarters()
      .flatMap((q) => q.goals)
      .filter((g) => ids.includes(g.id))
      .map((g) => g.title);
  });

  constructor() {
    effect(() => {
      const id = this.project().id;
      this.attachments.set([]);
      this.error.set('');
      this.api
        .attachments(id)
        .then((as) => this.attachments.set(as))
        .catch((e) => this.error.set(errorMessage(e)));
    });
  }
}
