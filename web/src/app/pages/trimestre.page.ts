import { Component, computed, effect, inject, input, signal } from '@angular/core';
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
import { Api, Cycle, MAX_CYCLES, MAX_OBJECTIFS, Objectif, Trimestre, messageErreur } from '../core/api';
import { estEnCours, jourCourt, jourLong, libelleTrimestre, semaineDuCycle } from '../core/dates';

@Component({
  selector: 'app-trimestre',
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
    <a routerLink="/trimestres" class="text-sm text-muted-foreground hover:text-foreground">← Tous les trimestres</a>

    @if (t(); as t) {
      <div class="mt-3 flex flex-col gap-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="flex items-center gap-2 text-2xl font-bold">
              {{ libelle(t) }}
              @if (enCours(t)) {
                <z-badge>En cours</z-badge>
              }
            </h1>
            <p class="text-sm text-muted-foreground">Du {{ long(t.debut) }} au {{ long(t.fin) }}</p>
          </div>
          <button z-button zType="ghost" class="text-destructive" (click)="supprimerTrimestre(t)">Supprimer le trimestre</button>
        </div>

        <!-- Objectifs -->
        <z-card>
          <z-card-header>
            <z-card-title>Objectifs du trimestre</z-card-title>
            <z-card-description>
              1 ou 2 objectifs. Chaque pitch dira lequel il sert ; un pitch qui n’en sert aucun ne passe pas, sauf exception assumée.
            </z-card-description>
          </z-card-header>
          <z-card-content class="flex flex-col gap-3">
            @for (o of t.objectifs; track o.id; let i = $index) {
              <div class="rounded-lg border p-3">
                @if (edition() === o.id) {
                  <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); enregistrerObjectif(o)">
                    <label class="sr-only" [for]="'titre-' + o.id">Titre</label>
                    <input z-input [id]="'titre-' + o.id" [(ngModel)]="editTitre" name="titre" />
                    <label class="sr-only" [for]="'desc-' + o.id">Description</label>
                    <textarea z-textarea [id]="'desc-' + o.id" rows="2" [(ngModel)]="editDescription" name="description" placeholder="Ce que ça change, comment on le mesure (facultatif)"></textarea>
                    <div class="flex gap-2">
                      <button z-button type="submit" zSize="sm" [zLoading]="occupe()">Enregistrer</button>
                      <button z-button type="button" zType="outline" zSize="sm" (click)="edition.set(null)">Annuler</button>
                    </div>
                  </form>
                } @else {
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="font-semibold"><span class="mr-2 font-mono text-xs text-primary">O{{ i + 1 }}</span>{{ o.titre }}</p>
                      @if (o.description) {
                        <p class="mt-1 text-sm whitespace-pre-line text-muted-foreground">{{ o.description }}</p>
                      }
                    </div>
                    <div class="flex gap-1">
                      <button z-button zType="ghost" zSize="sm" (click)="editer(o)">Modifier</button>
                      <button z-button zType="ghost" zSize="sm" class="text-destructive" (click)="supprimerObjectif(o)">Retirer</button>
                    </div>
                  </div>
                }
              </div>
            } @empty {
              <p class="text-sm text-amber-700 dark:text-amber-400">Aucun objectif pour l’instant.</p>
            }

            @if (t.objectifs.length < maxObjectifs) {
              <form class="flex flex-col gap-2 border-t pt-3" (submit)="$event.preventDefault(); ajouterObjectif()">
                <label class="text-sm font-medium" for="nouvel-objectif">{{ t.objectifs.length ? 'Second objectif (facultatif)' : 'Premier objectif' }}</label>
                <input z-input id="nouvel-objectif" [(ngModel)]="nouveauTitre" name="titre" placeholder="Ex. Réduire le temps de prise en main" />
                <textarea z-textarea rows="2" [(ngModel)]="nouvelleDescription" name="description" aria-label="Description de l’objectif" placeholder="Ce que ça change, comment on le mesure (facultatif)"></textarea>
                <div><button z-button type="submit" [zLoading]="occupe()">Ajouter l’objectif</button></div>
              </form>
            } @else {
              <p class="text-sm text-muted-foreground">Le trimestre a ses {{ maxObjectifs }} objectifs. Retirez-en un pour en changer.</p>
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
            @if (t.cycles.length) {
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
                    @for (c of t.cycles; track c.id) {
                      <tr z-table-row>
                        <td z-table-cell class="font-medium">
                          Cycle {{ c.numero }}
                          @if (semaine(c); as s) {
                            <z-badge class="ml-2">Semaine {{ s }}/4</z-badge>
                          }
                        </td>
                        <td z-table-cell class="whitespace-nowrap">{{ court(c.debut) }}</td>
                        <td z-table-cell class="whitespace-nowrap">{{ court(c.fin) }}</td>
                        <td z-table-cell class="whitespace-nowrap text-muted-foreground">semaine du {{ court(betting(c)) }}</td>
                        <td z-table-cell class="text-right">
                          <button z-button zType="ghost" zSize="sm" class="text-destructive" (click)="supprimerCycle(c)">Supprimer</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-sm text-muted-foreground">Aucun cycle pour l’instant.</p>
            }

            @if (t.cycles.length < maxCycles) {
              <form class="flex flex-wrap items-end gap-3 border-t pt-4" (submit)="$event.preventDefault(); ajouterCycle(t)">
                <label class="flex flex-col gap-1.5 text-sm font-medium" for="debut-cycle">
                  Début du cycle {{ t.cycles.length + 1 }} (un lundi)
                  <input z-input id="debut-cycle" type="date" class="w-48" [(ngModel)]="debut" name="debut" [min]="t.debut" [max]="t.fin" />
                </label>
                <button z-button type="submit" [zLoading]="occupe()">Ajouter le cycle</button>
                @if (debut()) {
                  <p class="w-full text-sm text-muted-foreground">Il ira du {{ long(debut()) }} au {{ long(finDe(debut())) }}.</p>
                }
              </form>
            } @else {
              <p class="text-sm text-muted-foreground">Les {{ maxCycles }} cycles du trimestre sont posés.</p>
            }
          </z-card-content>
        </z-card>
      </div>
    } @else if (introuvable()) {
      <p class="mt-6 text-sm text-muted-foreground">Ce trimestre n’existe pas ou a été supprimé.</p>
    } @else {
      <p class="mt-6 text-sm text-muted-foreground">Chargement…</p>
    }
  `,
})
export class TrimestrePage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ZardSonnerService);
  private readonly alerte = inject(ZardAlertDialogService);

  /** Paramètre de route */
  readonly id = input.required<string>();

  protected readonly maxObjectifs = MAX_OBJECTIFS;
  protected readonly maxCycles = MAX_CYCLES;
  protected readonly t = signal<Trimestre | null>(null);
  protected readonly introuvable = signal(false);
  protected readonly occupe = signal(false);
  protected readonly edition = signal<string | null>(null);

  protected readonly nouveauTitre = signal('');
  protected readonly nouvelleDescription = signal('');
  protected readonly editTitre = signal('');
  protected readonly editDescription = signal('');
  protected readonly debut = signal('');

  protected readonly libelle = libelleTrimestre;
  protected readonly court = jourCourt;
  protected readonly long = jourLong;
  protected readonly enCours = estEnCours;
  protected readonly semaine = semaineDuCycle;

  constructor() {
    effect(() => {
      const id = this.id();
      this.api
        .trimestre(id)
        .then((t) => this.recevoir(t))
        .catch(() => this.introuvable.set(true));
    });
  }

  private recevoir(t: Trimestre) {
    this.t.set(t);
    this.debut.set(t.prochainDebut && t.prochainDebut <= t.fin ? t.prochainDebut : '');
  }

  protected finDe(j: string) {
    const [a, m, d] = j.split('-').map(Number);
    const f = new Date(a, m - 1, d + 27);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  }

  /** La betting table tombe en semaine 4 : lundi = début + 21 jours */
  protected betting(c: Cycle) {
    const [a, m, d] = c.debut.split('-').map(Number);
    const b = new Date(a, m - 1, d + 21);
    return `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-${String(b.getDate()).padStart(2, '0')}`;
  }

  private async action(fn: () => Promise<Trimestre>, succes: string) {
    this.occupe.set(true);
    try {
      this.recevoir(await fn());
      this.toast.success(succes);
      return true;
    } catch (e) {
      this.toast.error(messageErreur(e));
      return false;
    } finally {
      this.occupe.set(false);
    }
  }

  protected async ajouterObjectif() {
    const titre = this.nouveauTitre().trim();
    if (!titre) {
      this.toast.error('Donnez un titre à l’objectif.');
      return;
    }
    const ok = await this.action(() => this.api.ajouterObjectif(this.id(), titre, this.nouvelleDescription()), 'Objectif ajouté');
    if (ok) {
      this.nouveauTitre.set('');
      this.nouvelleDescription.set('');
    }
  }

  protected editer(o: Objectif) {
    this.editTitre.set(o.titre);
    this.editDescription.set(o.description);
    this.edition.set(o.id);
  }

  protected async enregistrerObjectif(o: Objectif) {
    if (await this.action(() => this.api.modifierObjectif(o.id, this.editTitre(), this.editDescription()), 'Objectif modifié')) {
      this.edition.set(null);
    }
  }

  protected supprimerObjectif(o: Objectif) {
    this.alerte.confirm({
      zTitle: 'Retirer cet objectif ?',
      zDescription: `« ${o.titre} » sera retiré du trimestre.`,
      zOkText: 'Retirer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: () => {
        this.action(() => this.api.supprimerObjectif(o.id), 'Objectif retiré');
      },
    });
  }

  protected async ajouterCycle(t: Trimestre) {
    if (!this.debut()) {
      this.toast.error('Choisissez la date de début.');
      return;
    }
    await this.action(() => this.api.ajouterCycle(t.id, this.debut()), 'Cycle ajouté');
  }

  protected supprimerCycle(c: Cycle) {
    this.alerte.confirm({
      zTitle: `Supprimer le cycle ${c.numero} ?`,
      zDescription: `Le cycle du ${jourLong(c.debut)} au ${jourLong(c.fin)} sera supprimé.`,
      zOkText: 'Supprimer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: () => {
        this.action(() => this.api.supprimerCycle(c.id), 'Cycle supprimé');
      },
    });
  }

  protected supprimerTrimestre(t: Trimestre) {
    this.alerte.confirm({
      zTitle: `Supprimer ${libelleTrimestre(t)} ?`,
      zDescription: 'Ses objectifs et ses cycles seront supprimés définitivement.',
      zOkText: 'Supprimer définitivement',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: () => {
        this.api
          .supprimerTrimestre(t.id)
          .then(() => {
            this.toast.success(`${libelleTrimestre(t)} supprimé`);
            this.router.navigate(['/trimestres']);
          })
          .catch((e) => this.toast.error(messageErreur(e)));
      },
    });
  }
}
