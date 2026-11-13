import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Fichier, Projet, STATUTS, Trimestre, messageErreur } from '../core/api';
import { jourCourt } from '../core/dates';
import { PitchRenduComponent } from '../pitch/pitch-rendu.component';
import { libelleCycle, typeBadgeStatut } from './projet-libelles';

/** Le pitch seul, en lecture : pour le lire avant la betting table ou le partager. */
@Component({
  selector: 'app-pitch',
  imports: [RouterLink, ZardButtonComponent, ZardBadgeComponent, PitchRenduComponent],
  template: `
    @if (projet(); as p) {
      <div class="mx-auto flex max-w-3xl flex-col gap-6">
        <div class="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <a [routerLink]="['/projets', p.id]" class="text-sm text-muted-foreground hover:text-foreground">← Fiche du projet</a>
          <div class="flex gap-2">
            <button z-button zType="outline" zSize="sm" (click)="imprimer()">Imprimer</button>
            <a z-button zSize="sm" [routerLink]="['/projets', p.id]" [queryParams]="{ pitch: 'edition' }">Modifier le pitch</a>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-4 text-sm text-muted-foreground">
          <z-badge [zType]="badge(p.statut)">{{ statut(p.statut) }}</z-badge>
          <span>Owner : {{ p.owner }}</span>
          @if (p.cycle) {
            <span>{{ cycle(p.cycle) }} · {{ court(p.cycle.debut) }} → {{ court(p.cycle.fin) }}</span>
          }
          @if (objectifs().length) {
            <span>Objectifs : {{ objectifs().join(' · ') }}</span>
          } @else {
            <span>Aucun objectif rattaché</span>
          }
        </div>

        <article>
          @if (p.pitch.trim()) {
            <app-pitch-rendu [markdown]="p.pitch" />
          } @else {
            <h1 class="text-xl font-bold">{{ p.nom }}</h1>
            <p class="mt-4 text-sm text-muted-foreground">Pas encore de pitch.</p>
          }
        </article>

        @if (fichiers().length) {
          <div class="flex flex-col gap-2 border-t pt-4 text-sm">
            <h2 class="font-medium">Fichiers joints</h2>
            <ul class="flex flex-col gap-1">
              @for (f of fichiers(); track f.id) {
                <li><a [href]="f.url" target="_blank" rel="noopener" class="text-primary hover:underline">{{ f.nom }}</a></li>
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

  protected readonly projet = signal<Projet | null>(null);
  protected readonly fichiers = signal<Fichier[]>([]);
  private readonly trimestres = signal<Trimestre[]>([]);

  protected readonly objectifs = computed(() => {
    const ids = this.projet()?.objectifIds ?? [];
    return this.trimestres()
      .flatMap((t) => t.objectifs)
      .filter((o) => ids.includes(o.id))
      .map((o) => o.titre);
  });

  protected readonly badge = typeBadgeStatut;
  protected readonly cycle = libelleCycle;
  protected readonly court = jourCourt;
  protected statut(s: Projet['statut']) {
    return STATUTS[s];
  }

  constructor() {
    effect(() => {
      this.charger(this.id());
    });
  }

  private async charger(id: string) {
    try {
      const [p, fs, ts] = await Promise.all([this.api.projet(id), this.api.fichiers(id), this.api.trimestres()]);
      this.trimestres.set(ts);
      this.fichiers.set(fs);
      this.projet.set(p);
      document.title = `${p.nom} · Pitch`;
    } catch (e) {
      this.toast.error(messageErreur(e));
      await this.router.navigate(['/projets']);
    }
  }

  protected imprimer() {
    window.print();
  }
}
