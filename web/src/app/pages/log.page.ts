import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, DecisionLog, LogDecision, LogWeek, Project, Quarter, errorMessage } from '../core/api';
import { defaultQuarter, quarterLabel, shortDay, today } from '../core/dates';
import { ProjectPanelComponent } from './project-panel.component';

/**
 * The decision log, read-only: each weekly review of a quarter, most recent first,
 * with its decisions, the progress notes of the bets and the announcements.
 */
@Component({
  selector: 'app-log',
  imports: [NgTemplateOutlet, RouterLink, ZardBadgeComponent, ProjectPanelComponent, ...ZardSelectImports],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Journal des décisions</h1>
          <p class="text-sm text-muted-foreground">Chaque point hebdo du trimestre : les décisions, les notes de suivi et les infos diffusées.</p>
        </div>
        @if (quarters().length > 1) {
          <label class="flex items-center gap-2 text-sm font-medium">
            Trimestre
            <z-select class="w-36" [zValue]="selectedId() ?? ''" (zValueChange)="selectedId.set($any($event))" zPlaceholder="Trimestre">
              @for (q of quarters(); track q.id) {
                <z-select-item [zValue]="q.id">{{ label(q) }}</z-select-item>
              }
            </z-select>
          </label>
        }
      </div>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Chargement…</p>
      } @else if (!quarters().length) {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun trimestre pour l’instant. <a routerLink="/quarters" class="text-primary underline">Créez le premier</a>.
        </p>
      } @else if (log(); as l) {
        @for (w of l.weeks; track w.cycleId + w.week; let first = $first) {
          <section class="flex flex-col gap-4 rounded-xl border p-4" [attr.aria-labelledby]="'week-' + w.cycleId + '-' + w.week">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-semibold" [id]="'week-' + w.cycleId + '-' + w.week">Cycle {{ w.cycle }} · semaine {{ w.week }}</h2>
              <span class="text-sm text-muted-foreground">semaine du {{ short(w.startsOn) }}</span>
              @if (first && isThisWeek(w)) {
                <z-badge>Cette semaine</z-badge>
              }
              @if (!w.decisions.length && !w.notes.length && !w.announcements.length) {
                <span class="text-sm text-muted-foreground">· rien de noté</span>
              }
            </div>

            @if (w.decisions.length) {
              <div class="flex flex-col gap-1">
                <h3 class="text-sm font-medium text-muted-foreground">Décisions</h3>
                <ul class="flex flex-col gap-1 text-sm">
                  @for (d of w.decisions; track d.id) {
                    <li>
                      <ng-container *ngTemplateOutlet="decision; context: { $implicit: d }" />
                    </li>
                  }
                </ul>
              </div>
            }

            @if (w.notes.length) {
              <div class="flex flex-col gap-1">
                <h3 class="text-sm font-medium text-muted-foreground">Avancement des paris</h3>
                <ul class="flex flex-col gap-2 text-sm">
                  @for (n of w.notes; track n.id) {
                    <li>
                      @if (projectOf(n.projectId); as p) {
                        <button type="button" class="font-medium hover:underline" (click)="show(p)">{{ n.name }}</button>
                      } @else {
                        <span class="font-medium">{{ n.name }}</span>
                      }
                      <p class="whitespace-pre-line">{{ n.text }}</p>
                      <p class="text-xs text-muted-foreground">{{ who(n.updatedBy) }}</p>
                    </li>
                  }
                </ul>
              </div>
            }

            @if (w.announcements.length) {
              <div class="flex flex-col gap-1">
                <h3 class="text-sm font-medium text-muted-foreground">Infos diffusées</h3>
                <ul class="flex list-disc flex-col gap-1 pl-5 text-sm">
                  @for (a of w.announcements; track a.id) {
                    <li class="whitespace-pre-line">{{ a.text }}</li>
                  }
                </ul>
              </div>
            }

          </section>
        }

        @if (l.outside.length) {
          <section class="flex flex-col gap-2 rounded-xl border border-dashed p-4" aria-labelledby="outside">
            <div>
              <h2 id="outside" class="font-semibold">Hors cycle</h2>
              <p class="text-sm text-muted-foreground">Décisions prises entre deux cycles</p>
            </div>
            <ul class="flex flex-col gap-1 text-sm">
              @for (d of l.outside; track d.id) {
                <li>
                  <ng-container *ngTemplateOutlet="decision; context: { $implicit: d }" />
                </li>
              }
            </ul>
          </section>
        }

        @if (!l.weeks.length && !l.outside.length) {
          <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aucun point hebdo sur ce trimestre pour l’instant : son premier cycle n’a pas commencé.
          </p>
        }
      }
    </div>

    <ng-template #decision let-d>
      @if (projectOf(d.projectId); as p) {
        <button type="button" class="font-medium hover:underline" (click)="show(p)">{{ d.name }}</button>
      } @else {
        <span class="font-medium">{{ d.name }}</span>
      }
      @if (d.format === 'short' && d.requester) {
        <span class="text-muted-foreground"> (demandé par {{ d.requester }})</span>
      }
      : {{ d.text }}
      <span class="text-xs text-muted-foreground">· {{ when(d) }}, {{ who(d.by) }}</span>
    </ng-template>

    @if (shown(); as p) {
      <app-project-panel [project]="p" [quarters]="quarters()" from="log" (closed)="hide()" />
    }
  `,
})
export class LogPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly loading = signal(true);
  protected readonly quarters = signal<Quarter[]>([]);
  private readonly projects = signal<Project[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly log = signal<DecisionLog | null>(null);
  protected readonly shown = signal<Project | null>(null);
  private opener: HTMLElement | null = null;

  protected readonly label = quarterLabel;
  protected readonly short = shortDay;

  private readonly byId = computed(() => new Map(this.projects().map((p) => [p.id, p])));

  constructor() {
    this.load();
    effect(() => {
      const id = this.selectedId();
      if (id) this.loadLog(id);
    });
  }

  private async load() {
    try {
      const [qs, ps] = await Promise.all([this.api.quarters(), this.api.projects()]);
      const sorted = [...qs].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
      this.quarters.set(sorted);
      this.projects.set(ps);
      this.selectedId.set(defaultQuarter(sorted)?.id ?? null);
      if (!sorted.length) this.loading.set(false);
    } catch (e) {
      this.toast.error(errorMessage(e));
      this.loading.set(false);
    }
  }

  private async loadLog(quarterId: string) {
    try {
      const l = await this.api.log(quarterId);
      // Ignore a late answer for a quarter no longer selected.
      if (this.selectedId() === quarterId) this.log.set(l);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected projectOf(id: string) {
    return this.byId().get(id) ?? null;
  }

  protected isThisWeek(w: LogWeek) {
    return w.startsOn <= today() && today() < addWeek(w.startsOn);
  }

  /** "12 nov." in local time */
  protected when(d: LogDecision) {
    return new Date(d.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  /** The name part of an email */
  protected who(email: string) {
    return email.split('@')[0];
  }

  protected show(p: Project) {
    this.opener = document.activeElement as HTMLElement | null;
    this.shown.set(p);
  }

  protected hide() {
    this.shown.set(null);
    this.opener?.focus();
    this.opener = null;
  }
}

function addWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(y, m - 1, d + 7);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}
