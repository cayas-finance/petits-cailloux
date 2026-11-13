import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardTableImports } from '@/shared/components/table';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Projet, STATUTS, Statut, Trimestre, messageErreur } from '../core/api';
import { jourCourt } from '../core/dates';
import { libelleCycle, typeBadgeStatut } from './projet-libelles';

@Component({
  selector: 'app-projets',
  imports: [RouterLink, ZardButtonComponent, ZardBadgeComponent, ...ZardSelectImports, ...ZardTableImports],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Projets</h1>
          <p class="text-sm text-muted-foreground">Chaque projet a un owner, un statut, et un cycle une fois misé.</p>
        </div>
        <a z-button routerLink="/projets/nouveau">Nouveau projet</a>
      </div>

      <label class="flex items-center gap-2 text-sm font-medium">
        Statut
        <z-select class="w-56" [(zValue)]="filtre" zPlaceholder="Tous">
          <z-select-item zValue="tous">Tous</z-select-item>
          @for (s of statuts; track s[0]) {
            <z-select-item [zValue]="s[0]">{{ s[1] }}</z-select-item>
          }
        </z-select>
      </label>

      @if (chargement()) {
        <p class="text-sm text-muted-foreground">Chargement…</p>
      } @else if (!visibles().length) {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          @if (liste().length) {
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
              </tr>
            </thead>
            <tbody z-table-body>
              @for (p of visibles(); track p.id) {
                <tr z-table-row>
                  <td z-table-cell class="font-medium">
                    <a [routerLink]="['/projets', p.id]" class="hover:underline">{{ p.nom }}</a>
                  </td>
                  <td z-table-cell class="text-muted-foreground">{{ p.owner }}</td>
                  <td z-table-cell><z-badge [zType]="badge(p.statut)">{{ libelleStatut(p.statut) }}</z-badge></td>
                  <td z-table-cell>
                    @if (p.cycle) {
                      {{ cycle(p.cycle) }}
                      <span class="text-muted-foreground"> · {{ court(p.cycle.debut) }}</span>
                    } @else {
                      <span class="text-muted-foreground">—</span>
                    }
                  </td>
                  <td z-table-cell>
                    @for (id of p.objectifIds; track id) {
                      <div>{{ titreObjectif(id) }}</div>
                    } @empty {
                      <span class="text-muted-foreground">—</span>
                    }
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
export class ProjetsPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly statuts = Object.entries(STATUTS) as [Statut, string][];
  protected readonly liste = signal<Projet[]>([]);
  private readonly trimestres = signal<Trimestre[]>([]);
  protected readonly chargement = signal(true);
  protected readonly filtre = signal('tous');

  protected readonly visibles = computed(() =>
    this.filtre() === 'tous' ? this.liste() : this.liste().filter((p) => p.statut === this.filtre()),
  );
  private readonly objectifs = computed(
    () => new Map(this.trimestres().flatMap((t) => t.objectifs.map((o) => [o.id, o.titre] as const))),
  );

  protected readonly court = jourCourt;
  protected readonly badge = typeBadgeStatut;
  protected readonly cycle = libelleCycle;
  protected libelleStatut(s: Statut) {
    return STATUTS[s];
  }
  protected titreObjectif(id: string) {
    return this.objectifs().get(id) ?? '?';
  }

  constructor() {
    this.charger();
  }

  private async charger() {
    try {
      const [ps, ts] = await Promise.all([this.api.projets(), this.api.trimestres()]);
      this.liste.set(ps);
      this.trimestres.set(ts);
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.chargement.set(false);
    }
  }
}
