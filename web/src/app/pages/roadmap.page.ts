import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Cycle, Project, Quarter, errorMessage } from '../core/api';
import { quarterLabel, shortDay, today } from '../core/dates';
import { ProjectPanelComponent } from './project-panel.component';

/** Statuses shown in the "Prochainement" column, in this order */
const UPCOMING = [
  { status: 'ready', label: 'Pitch prêt' },
  { status: 'waiting', label: 'Attend le prochain cycle' },
  { status: 'shaping', label: 'En shaping' },
] as const;

/**
 * The quarter at a glance, read-only: its goals, the bets and short topics of each
 * cycle, and the bets coming next.
 */
@Component({
  selector: 'app-roadmap',
  imports: [RouterLink, ZardBadgeComponent, ProjectPanelComponent, ...ZardSelectImports],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Roadmap</h1>
          <p class="text-sm text-muted-foreground">Ce qui est misé sur chaque cycle du trimestre, et ce qui arrive ensuite.</p>
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
      } @else if (quarter(); as q) {
        <section class="flex flex-col gap-2" aria-label="Objectifs du trimestre">
          <h2 class="text-sm font-medium text-muted-foreground">{{ label(q) }} · {{ short(q.startsOn) }} → {{ short(q.endsOn) }}</h2>
          @if (q.goals.length) {
            <ul class="flex flex-col gap-1">
              @for (g of q.goals; track g.id; let i = $index) {
                <li class="font-semibold"><span class="mr-2 font-mono text-xs text-primary">O{{ i + 1 }}</span>{{ g.title }}</li>
              }
            </ul>
          } @else {
            <p class="text-sm text-amber-700 dark:text-amber-400">Aucun objectif fixé pour ce trimestre.</p>
          }
        </section>

        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          @for (c of q.cycles; track c.id) {
            <section class="flex flex-col gap-3 rounded-xl border p-3" [attr.aria-label]="'Cycle ' + c.number">
              <div>
                <h2 class="flex items-center gap-2 font-semibold">
                  Cycle {{ c.number }}
                  @if (state(c) === 'running') {
                    <z-badge>En cours</z-badge>
                  } @else if (state(c) === 'done') {
                    <z-badge zType="outline">Terminé</z-badge>
                  }
                </h2>
                <p class="text-xs text-muted-foreground">{{ short(c.startsOn) }} → {{ short(c.endsOn) }}</p>
              </div>

              @for (p of betsOf(c); track p.id) {
                <button type="button" class="flex flex-col gap-1 rounded-lg border bg-background p-2 text-left hover:border-primary" (click)="show(p)">
                  <span class="text-sm font-medium">{{ p.name }}</span>
                  <span class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    @if (p.status === 'shipped') {
                      <z-badge zType="outline">Livré</z-badge>
                    }
                    @for (o of goalTags(p, q); track o) {
                      <span class="font-mono text-primary">{{ o }}</span>
                    }
                    <span class="truncate">{{ p.owner }}</span>
                  </span>
                </button>
              } @empty {
                <p class="text-sm text-muted-foreground">Aucun pari.</p>
              }

              @if (shortTopicsOf(c).length) {
                <div class="flex flex-col gap-1 border-t pt-2">
                  <h3 class="text-xs font-medium text-muted-foreground">Sujets courts</h3>
                  @for (p of shortTopicsOf(c); track p.id) {
                    <button type="button" class="text-left text-sm hover:underline" (click)="show(p)">
                      {{ p.status === 'shipped' ? '✓' : '·' }} {{ p.name }}
                    </button>
                  }
                </div>
              }
            </section>
          } @empty {
            <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
              Aucun cycle sur ce trimestre.
              <a [routerLink]="['/quarters', q.id]" class="text-primary underline">Ajoutez-en un</a>.
            </p>
          }

          <section class="flex flex-col gap-3 rounded-xl border border-dashed p-3" aria-label="Prochainement">
            <div>
              <h2 class="font-semibold">Prochainement</h2>
              <p class="text-xs text-muted-foreground">Paris pas encore misés</p>
            </div>
            @for (group of upcoming(); track group.label) {
              <div class="flex flex-col gap-2">
                <h3 class="text-xs font-medium text-muted-foreground">{{ group.label }}</h3>
                @for (p of group.projects; track p.id) {
                  <button type="button" class="flex flex-col gap-1 rounded-lg border bg-background p-2 text-left hover:border-primary" (click)="show(p)">
                    <span class="text-sm font-medium">{{ p.name }}</span>
                    <span class="truncate text-xs text-muted-foreground">{{ p.owner }}</span>
                  </button>
                }
              </div>
            } @empty {
              <p class="text-sm text-muted-foreground">Rien en préparation.</p>
            }
          </section>
        </div>
      } @else {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun trimestre pour l’instant. <a routerLink="/quarters" class="text-primary underline">Créez le premier</a>.
        </p>
      }
    </div>

    @if (shown(); as p) {
      <app-project-panel [project]="p" [quarters]="quarters()" from="roadmap" (closed)="hide()" />
    }
  `,
})
export class RoadmapPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly loading = signal(true);
  protected readonly quarters = signal<Quarter[]>([]);
  private readonly projects = signal<Project[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly shown = signal<Project | null>(null);
  private opener: HTMLElement | null = null;

  protected readonly label = quarterLabel;
  protected readonly short = shortDay;

  protected readonly quarter = computed(() => this.quarters().find((q) => q.id === this.selectedId()) ?? null);

  protected readonly upcoming = computed(() =>
    UPCOMING.map((u) => ({
      label: u.label,
      projects: this.projects().filter((p) => p.format === 'bet' && p.status === u.status),
    })).filter((g) => g.projects.length),
  );

  constructor() {
    this.load();
  }

  private async load() {
    try {
      const [qs, ps] = await Promise.all([this.api.quarters(), this.api.projects()]);
      const sorted = [...qs].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
      this.quarters.set(sorted);
      this.projects.set(ps);
      this.selectedId.set(defaultQuarter(sorted)?.id ?? null);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected state(c: Cycle): 'done' | 'running' | 'upcoming' {
    const t = today();
    return c.endsOn < t ? 'done' : c.startsOn <= t ? 'running' : 'upcoming';
  }

  protected betsOf(c: Cycle) {
    return this.projects()
      .filter((p) => p.format === 'bet' && p.cycleId === c.id && (p.status === 'bet' || p.status === 'shipped'))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  protected shortTopicsOf(c: Cycle) {
    return this.projects()
      .filter((p) => p.format === 'short' && p.cycleId === c.id && (p.status === 'bet' || p.status === 'shipped'))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  /** "O1", "O2": the quarter's goals the project serves */
  protected goalTags(p: Project, q: Quarter) {
    return q.goals.flatMap((g, i) => (p.goalIds.includes(g.id) ? [`O${i + 1}`] : []));
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

/** The quarter running today, otherwise the next one, otherwise the last one. */
function defaultQuarter(quarters: Quarter[]): Quarter | undefined {
  const t = today();
  return quarters.find((q) => q.startsOn <= t && t <= q.endsOn) ?? quarters.find((q) => q.startsOn > t) ?? quarters.at(-1);
}
