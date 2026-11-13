import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardCardImports } from '@/shared/components/card';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, MAX_CYCLES, MAX_OBJECTIFS, Trimestre, messageErreur } from '../core/api';
import { estEnCours, jourCourt, libelleTrimestre, trimestreCourant } from '../core/dates';

@Component({
  selector: 'app-trimestres',
  imports: [FormsModule, RouterLink, ZardButtonComponent, ZardBadgeComponent, ...ZardCardImports, ...ZardSelectImports],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Trimestres</h1>
          <p class="text-sm text-muted-foreground">
            Chaque trimestre porte 1 ou 2 objectifs et se découpe en {{ maxCycles }} cycles de 4 semaines.
          </p>
        </div>
      </div>

      <z-card>
        <z-card-header>
          <z-card-title>Nouveau trimestre</z-card-title>
          <z-card-description>On fixe les objectifs juste après la création.</z-card-description>
        </z-card-header>
        <z-card-content>
          <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); creer()">
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Trimestre
              <z-select class="w-32" [(zValue)]="numero" zPlaceholder="Trimestre">
                @for (n of [1, 2, 3, 4]; track n) {
                  <z-select-item [zValue]="'' + n">T{{ n }}</z-select-item>
                }
              </z-select>
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Année
              <z-select class="w-32" [(zValue)]="annee" zPlaceholder="Année">
                @for (a of annees; track a) {
                  <z-select-item [zValue]="'' + a">{{ a }}</z-select-item>
                }
              </z-select>
            </label>
            <button z-button type="submit" [zLoading]="enCours()">Créer {{ apercu() }}</button>
          </form>
        </z-card-content>
      </z-card>

      @if (chargement()) {
        <p class="text-sm text-muted-foreground">Chargement…</p>
      } @else if (!liste().length) {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun trimestre pour l’instant. Créez le premier ci-dessus.
        </p>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2">
          @for (t of liste(); track t.id) {
            <a [routerLink]="['/trimestres', t.id]" class="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <z-card class="h-full transition-colors hover:border-primary">
                <z-card-header>
                  <z-card-title class="flex items-center gap-2">
                    {{ libelle(t) }}
                    @if (enCoursT(t)) {
                      <z-badge>En cours</z-badge>
                    }
                  </z-card-title>
                  <z-card-description>{{ court(t.debut) }} → {{ court(t.fin) }}</z-card-description>
                </z-card-header>
                <z-card-content class="flex flex-col gap-2 text-sm">
                  @if (t.objectifs.length) {
                    <ul class="list-disc pl-5">
                      @for (o of t.objectifs; track o.id) {
                        <li>{{ o.titre }}</li>
                      }
                    </ul>
                  } @else {
                    <p class="text-amber-700 dark:text-amber-400">Aucun objectif fixé</p>
                  }
                  <p class="text-muted-foreground">
                    {{ t.objectifs.length }}/{{ maxObjectifs }} objectifs · {{ t.cycles.length }}/{{ maxCycles }} cycles
                  </p>
                </z-card-content>
              </z-card>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class TrimestresPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ZardSonnerService);

  protected readonly maxObjectifs = MAX_OBJECTIFS;
  protected readonly maxCycles = MAX_CYCLES;
  protected readonly liste = signal<Trimestre[]>([]);
  protected readonly chargement = signal(true);
  protected readonly enCours = signal(false);

  private readonly courant = trimestreCourant();
  protected readonly annees = [this.courant.annee - 1, this.courant.annee, this.courant.annee + 1];
  protected readonly numero = signal(String(this.courant.numero));
  protected readonly annee = signal(String(this.courant.annee));
  protected readonly apercu = computed(() => `T${this.numero()} ${this.annee()}`);

  protected readonly libelle = libelleTrimestre;
  protected readonly court = jourCourt;
  protected readonly enCoursT = estEnCours;

  constructor() {
    this.charger();
  }

  private async charger() {
    try {
      this.liste.set(await this.api.trimestres());
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.chargement.set(false);
    }
  }

  protected async creer() {
    this.enCours.set(true);
    try {
      const t = await this.api.creerTrimestre(Number(this.annee()), Number(this.numero()));
      this.toast.success(`${libelleTrimestre(t)} créé`);
      await this.router.navigate(['/trimestres', t.id]);
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.enCours.set(false);
    }
  }
}
