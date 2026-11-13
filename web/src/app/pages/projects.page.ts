import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardTableImports } from '@/shared/components/table';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Project, Quarter, STATUSES, Status, errorMessage } from '../core/api';
import { shortDay } from '../core/dates';
import { cycleLabel, statusBadgeType } from './project-labels';

@Component({
  selector: 'app-projects',
  imports: [RouterLink, ZardButtonComponent, ZardBadgeComponent, ...ZardSelectImports, ...ZardTableImports],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Projets</h1>
          <p class="text-sm text-muted-foreground">Chaque projet a un owner, un statut, et un cycle une fois misé.</p>
        </div>
        <a z-button routerLink="/projects/new">Nouveau projet</a>
      </div>

      <label class="flex items-center gap-2 text-sm font-medium">
        Statut
        <z-select class="w-56" [(zValue)]="filter" zPlaceholder="Tous">
          <z-select-item zValue="all">Tous</z-select-item>
          @for (s of statuses; track s[0]) {
            <z-select-item [zValue]="s[0]">{{ s[1] }}</z-select-item>
          }
        </z-select>
      </label>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Chargement…</p>
      } @else if (!visible().length) {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          @if (projects().length) {
            Aucun projet avec ce statut.
          } @else {
            Aucun projet pour l’instant.
          }
        </p>
      } @else {
        <div class="relative overflow-x-auto rounded-lg border">
          <table z-table>
            <thead z-table-header>
              <tr z-table-row>
                <th z-table-head>Nom</th>
                <th z-table-head>Owner</th>
                <th z-table-head>Statut</th>
                <th z-table-head>Cycle</th>
                <th z-table-head>Objectifs</th>
                <th z-table-head><span class="sr-only">Pitch</span></th>
              </tr>
            </thead>
            <tbody z-table-body>
              @for (p of visible(); track p.id) {
                <tr z-table-row>
                  <td z-table-cell class="font-medium">
                    <a [routerLink]="['/projects', p.id]" class="hover:underline">{{ p.name }}</a>
                  </td>
                  <td z-table-cell class="text-muted-foreground">{{ p.owner }}</td>
                  <td z-table-cell><z-badge [zType]="badge(p.status)">{{ statusLabel(p.status) }}</z-badge></td>
                  <td z-table-cell>
                    @if (p.cycle) {
                      {{ cycle(p.cycle) }}
                      <span class="text-muted-foreground"> · {{ short(p.cycle.startsOn) }}</span>
                    } @else {
                      <span class="text-muted-foreground">—</span>
                    }
                  </td>
                  <td z-table-cell>
                    @for (id of p.goalIds; track id) {
                      <div>{{ goalTitle(id) }}</div>
                    } @empty {
                      <span class="text-muted-foreground">—</span>
                    }
                  </td>
                  <td z-table-cell class="text-right">
                    <a [routerLink]="['/projects', p.id, 'pitch']" class="text-sm whitespace-nowrap text-primary hover:underline">Lire le pitch</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ProjectsPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly statuses = Object.entries(STATUSES) as [Status, string][];
  protected readonly projects = signal<Project[]>([]);
  private readonly quarters = signal<Quarter[]>([]);
  protected readonly loading = signal(true);
  protected readonly filter = signal('all');

  protected readonly visible = computed(() =>
    this.filter() === 'all' ? this.projects() : this.projects().filter((p) => p.status === this.filter()),
  );
  private readonly goals = computed(
    () => new Map(this.quarters().flatMap((q) => q.goals.map((g) => [g.id, g.title] as const))),
  );

  protected readonly short = shortDay;
  protected readonly badge = statusBadgeType;
  protected readonly cycle = cycleLabel;
  protected statusLabel(s: Status) {
    return STATUSES[s];
  }
  protected goalTitle(id: string) {
    return this.goals().get(id) ?? '?';
  }

  constructor() {
    this.load();
  }

  private async load() {
    try {
      const [ps, qs] = await Promise.all([this.api.projects(), this.api.quarters()]);
      this.projects.set(ps);
      this.quarters.set(qs);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
