import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardCardImports } from '@/shared/components/card';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardTextareaComponent } from '@/shared/components/textarea';
import { ZardTableImports } from '@/shared/components/table';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { Api, Cycle, Goal, MAX_CYCLES, MAX_GOALS, Quarter, errorMessage } from '../core/api';
import { cycleWeek, isRunning, longDay, quarterLabel, shortDay } from '../core/dates';

@Component({
  selector: 'app-quarter',
  imports: [
    FormsModule,
    RouterLink,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardInputComponent,
    ZardTextareaComponent,
    ...ZardCardImports,
    ...ZardTableImports,
  ],
  template: `
    <a routerLink="/quarters" class="text-sm text-muted-foreground hover:text-foreground">← Tous les trimestres</a>

    @if (quarter(); as q) {
      <div class="mt-3 flex flex-col gap-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="flex items-center gap-2 text-2xl font-bold">
              {{ label(q) }}
              @if (running(q)) {
                <z-badge>En cours</z-badge>
              }
            </h1>
            <p class="text-sm text-muted-foreground">Du {{ long(q.startsOn) }} au {{ long(q.endsOn) }}</p>
          </div>
          <button z-button zType="ghost" class="text-destructive" (click)="deleteQuarter(q)">Supprimer le trimestre</button>
        </div>

        <!-- Goals -->
        <z-card>
          <z-card-header>
            <z-card-title>Objectifs du trimestre</z-card-title>
            <z-card-description>
              1 ou 2 objectifs. Chaque pitch dira lequel il sert ; un pitch qui n’en sert aucun ne passe pas, sauf exception assumée.
            </z-card-description>
          </z-card-header>
          <z-card-content class="flex flex-col gap-3">
            @for (g of q.goals; track g.id; let i = $index) {
              <div class="rounded-lg border p-3">
                @if (editing() === g.id) {
                  <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); saveGoal(g)">
                    <label class="sr-only" [for]="'title-' + g.id">Titre</label>
                    <input z-input [id]="'title-' + g.id" [(ngModel)]="editTitle" name="title" />
                    <label class="sr-only" [for]="'desc-' + g.id">Description</label>
                    <textarea z-textarea [id]="'desc-' + g.id" rows="2" [(ngModel)]="editDescription" name="description" placeholder="Ce que ça change, comment on le mesure (facultatif)"></textarea>
                    <div class="flex gap-2">
                      <button z-button type="submit" zSize="sm" [zLoading]="busy()">Enregistrer</button>
                      <button z-button type="button" zType="outline" zSize="sm" (click)="editing.set(null)">Annuler</button>
                    </div>
                  </form>
                } @else {
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="font-semibold"><span class="mr-2 font-mono text-xs text-primary">O{{ i + 1 }}</span>{{ g.title }}</p>
                      @if (g.description) {
                        <p class="mt-1 text-sm whitespace-pre-line text-muted-foreground">{{ g.description }}</p>
                      }
                    </div>
                    <div class="flex gap-1">
                      <button z-button zType="ghost" zSize="sm" (click)="edit(g)">Modifier</button>
                      <button z-button zType="ghost" zSize="sm" class="text-destructive" (click)="deleteGoal(g)">Retirer</button>
                    </div>
                  </div>
                }
              </div>
            } @empty {
              <p class="text-sm text-amber-700 dark:text-amber-400">Aucun objectif pour l’instant.</p>
            }

            @if (q.goals.length < maxGoals) {
              <form class="flex flex-col gap-2 border-t pt-3" (submit)="$event.preventDefault(); addGoal()">
                <label class="text-sm font-medium" for="new-goal">{{ q.goals.length ? 'Second objectif (facultatif)' : 'Premier objectif' }}</label>
                <input z-input id="new-goal" [(ngModel)]="newTitle" name="title" placeholder="Ex. Réduire le temps de prise en main" />
                <textarea z-textarea rows="2" [(ngModel)]="newDescription" name="description" aria-label="Description de l’objectif" placeholder="Ce que ça change, comment on le mesure (facultatif)"></textarea>
                <div><button z-button type="submit" [zLoading]="busy()">Ajouter l’objectif</button></div>
              </form>
            } @else {
              <p class="text-sm text-muted-foreground">Le trimestre a ses {{ maxGoals }} objectifs. Retirez-en un pour en changer.</p>
            }
          </z-card-content>
        </z-card>

        <!-- Cycles -->
        <z-card>
          <z-card-header>
            <z-card-title>Cycles</z-card-title>
            <z-card-description>
              {{ maxCycles }} cycles de 4 semaines au plus, du lundi au dimanche. La betting table a lieu la dernière semaine de chaque cycle.
            </z-card-description>
          </z-card-header>
          <z-card-content class="flex flex-col gap-4">
            @if (q.cycles.length) {
              <div class="relative overflow-x-auto">
                <table z-table>
                  <thead z-table-header>
                    <tr z-table-row>
                      <th z-table-head>Cycle</th>
                      <th z-table-head>Du</th>
                      <th z-table-head>Au</th>
                      <th z-table-head>Betting table</th>
                      <th z-table-head><span class="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody z-table-body>
                    @for (c of q.cycles; track c.id) {
                      <tr z-table-row>
                        <td z-table-cell class="font-medium">
                          Cycle {{ c.number }}
                          @if (week(c); as w) {
                            <z-badge class="ml-2">Semaine {{ w }}/4</z-badge>
                          }
                        </td>
                        <td z-table-cell class="whitespace-nowrap">{{ short(c.startsOn) }}</td>
                        <td z-table-cell class="whitespace-nowrap">{{ short(c.endsOn) }}</td>
                        <td z-table-cell class="whitespace-nowrap text-muted-foreground">semaine du {{ short(bettingTable(c)) }}</td>
                        <td z-table-cell class="text-right">
                          <button z-button zType="ghost" zSize="sm" class="text-destructive" (click)="deleteCycle(c)">Supprimer</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-sm text-muted-foreground">Aucun cycle pour l’instant.</p>
            }

            @if (q.cycles.length < maxCycles) {
              <form class="flex flex-wrap items-end gap-3 border-t pt-4" (submit)="$event.preventDefault(); addCycle(q)">
                <label class="flex flex-col gap-1.5 text-sm font-medium" for="cycle-start">
                  Début du cycle {{ q.cycles.length + 1 }} (un lundi)
                  <input z-input id="cycle-start" type="date" class="w-48" [(ngModel)]="startsOn" name="startsOn" [min]="q.startsOn" [max]="q.endsOn" />
                </label>
                <button z-button type="submit" [zLoading]="busy()">Ajouter le cycle</button>
                @if (startsOn()) {
                  <p class="w-full text-sm text-muted-foreground">Il ira du {{ long(startsOn()) }} au {{ long(endOf(startsOn())) }}.</p>
                }
              </form>
            } @else {
              <p class="text-sm text-muted-foreground">Les {{ maxCycles }} cycles du trimestre sont posés.</p>
            }
          </z-card-content>
        </z-card>
      </div>
    } @else if (notFound()) {
      <p class="mt-6 text-sm text-muted-foreground">Ce trimestre n’existe pas ou a été supprimé.</p>
    } @else {
      <p class="mt-6 text-sm text-muted-foreground">Chargement…</p>
    }
  `,
})
export class QuarterPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ZardSonnerService);
  private readonly alert = inject(ZardAlertDialogService);

  /** Route parameter */
  readonly id = input.required<string>();

  protected readonly maxGoals = MAX_GOALS;
  protected readonly maxCycles = MAX_CYCLES;
  protected readonly quarter = signal<Quarter | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly editing = signal<string | null>(null);

  protected readonly newTitle = signal('');
  protected readonly newDescription = signal('');
  protected readonly editTitle = signal('');
  protected readonly editDescription = signal('');
  protected readonly startsOn = signal('');

  protected readonly label = quarterLabel;
  protected readonly short = shortDay;
  protected readonly long = longDay;
  protected readonly running = isRunning;
  protected readonly week = cycleWeek;

  constructor() {
    effect(() => {
      const id = this.id();
      this.api
        .quarter(id)
        .then((q) => this.receive(q))
        .catch(() => this.notFound.set(true));
    });
  }

  private receive(q: Quarter) {
    this.quarter.set(q);
    this.startsOn.set(q.nextStart && q.nextStart <= q.endsOn ? q.nextStart : '');
  }

  protected endOf(day: string) {
    return plusDays(day, 27);
  }

  /** The betting table falls in week 4: Monday = start + 21 days */
  protected bettingTable(c: Cycle) {
    return plusDays(c.startsOn, 21);
  }

  private async run(fn: () => Promise<Quarter>, success: string) {
    this.busy.set(true);
    try {
      this.receive(await fn());
      this.toast.success(success);
      return true;
    } catch (e) {
      this.toast.error(errorMessage(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async addGoal() {
    const title = this.newTitle().trim();
    if (!title) {
      this.toast.error('Donnez un titre à l’objectif.');
      return;
    }
    const ok = await this.run(() => this.api.addGoal(this.id(), title, this.newDescription()), 'Objectif ajouté');
    if (ok) {
      this.newTitle.set('');
      this.newDescription.set('');
    }
  }

  protected edit(g: Goal) {
    this.editTitle.set(g.title);
    this.editDescription.set(g.description);
    this.editing.set(g.id);
  }

  protected async saveGoal(g: Goal) {
    if (await this.run(() => this.api.updateGoal(g.id, this.editTitle(), this.editDescription()), 'Objectif modifié')) {
      this.editing.set(null);
    }
  }

  protected deleteGoal(g: Goal) {
    this.alert.confirm({
      zTitle: 'Retirer cet objectif ?',
      zDescription: `« ${g.title} » sera retiré du trimestre.`,
      zOkText: 'Retirer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: () => {
        this.run(() => this.api.deleteGoal(g.id), 'Objectif retiré');
      },
    });
  }

  protected async addCycle(q: Quarter) {
    if (!this.startsOn()) {
      this.toast.error('Choisissez la date de début.');
      return;
    }
    await this.run(() => this.api.addCycle(q.id, this.startsOn()), 'Cycle ajouté');
  }

  protected deleteCycle(c: Cycle) {
    this.alert.confirm({
      zTitle: `Supprimer le cycle ${c.number} ?`,
      zDescription: `Le cycle du ${longDay(c.startsOn)} au ${longDay(c.endsOn)} sera supprimé.`,
      zOkText: 'Supprimer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: () => {
        this.run(() => this.api.deleteCycle(c.id), 'Cycle supprimé');
      },
    });
  }

  protected deleteQuarter(q: Quarter) {
    this.alert.confirm({
      zTitle: `Supprimer ${quarterLabel(q)} ?`,
      zDescription: 'Ses objectifs et ses cycles seront supprimés définitivement.',
      zOkText: 'Supprimer définitivement',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: () => {
        this.api
          .deleteQuarter(q.id)
          .then(() => {
            this.toast.success(`${quarterLabel(q)} supprimé`);
            this.router.navigate(['/quarters']);
          })
          .catch((e) => this.toast.error(errorMessage(e)));
      },
    });
  }
}

function plusDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  const r = new Date(y, m - 1, d + n);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
}
