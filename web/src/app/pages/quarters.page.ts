import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardCardImports } from '@/shared/components/card';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, MAX_CYCLES, Quarter, errorMessage } from '../core/api';
import { currentQuarter, isRunning, quarterLabel, shortDay } from '../core/dates';

@Component({
  selector: 'app-quarters',
  imports: [FormsModule, RouterLink, ZardButtonComponent, ZardBadgeComponent, ...ZardCardImports, ...ZardSelectImports],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Trimestres</h1>
          <p class="text-sm text-muted-foreground">
            Chaque trimestre porte ses objectifs et se découpe en {{ maxCycles }} cycles de 4 semaines.
          </p>
        </div>
      </div>

      <z-card>
        <z-card-header>
          <z-card-title>Nouveau trimestre</z-card-title>
          <z-card-description>On fixe les objectifs juste après la création.</z-card-description>
        </z-card-header>
        <z-card-content>
          <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); create()">
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Trimestre
              <z-select class="w-32" [(zValue)]="number" zPlaceholder="Trimestre">
                @for (n of [1, 2, 3, 4]; track n) {
                  <z-select-item [zValue]="'' + n">T{{ n }}</z-select-item>
                }
              </z-select>
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Année
              <z-select class="w-32" [(zValue)]="year" zPlaceholder="Année">
                @for (y of years; track y) {
                  <z-select-item [zValue]="'' + y">{{ y }}</z-select-item>
                }
              </z-select>
            </label>
            <button z-button type="submit" [zLoading]="saving()">Créer {{ preview() }}</button>
          </form>
        </z-card-content>
      </z-card>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Chargement…</p>
      } @else if (!quarters().length) {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun trimestre pour l’instant. Créez le premier ci-dessus.
        </p>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2">
          @for (q of quarters(); track q.id) {
            <a [routerLink]="['/quarters', q.id]" class="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <z-card class="h-full transition-colors hover:border-primary">
                <z-card-header>
                  <z-card-title class="flex items-center gap-2">
                    {{ label(q) }}
                    @if (running(q)) {
                      <z-badge>En cours</z-badge>
                    }
                  </z-card-title>
                  <z-card-description>{{ short(q.startsOn) }} → {{ short(q.endsOn) }}</z-card-description>
                </z-card-header>
                <z-card-content class="flex flex-col gap-2 text-sm">
                  @if (q.goals.length) {
                    <ul class="list-disc pl-5">
                      @for (g of q.goals; track g.id) {
                        <li>{{ g.title }}</li>
                      }
                    </ul>
                  } @else {
                    <p class="text-amber-700 dark:text-amber-400">Aucun objectif fixé</p>
                  }
                  <p class="text-muted-foreground">
                    {{ q.goals.length }} objectif{{ q.goals.length > 1 ? 's' : '' }} · {{ q.cycles.length }}/{{ maxCycles }} cycles
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
export class QuartersPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ZardSonnerService);

  protected readonly maxCycles = MAX_CYCLES;
  protected readonly quarters = signal<Quarter[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  private readonly current = currentQuarter();
  protected readonly years = [this.current.year - 1, this.current.year, this.current.year + 1];
  protected readonly number = signal(String(this.current.number));
  protected readonly year = signal(String(this.current.year));
  protected readonly preview = computed(() => `T${this.number()} ${this.year()}`);

  protected readonly label = quarterLabel;
  protected readonly short = shortDay;
  protected readonly running = isRunning;

  constructor() {
    this.load();
  }

  private async load() {
    try {
      this.quarters.set(await this.api.quarters());
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async create() {
    this.saving.set(true);
    try {
      const q = await this.api.createQuarter(Number(this.year()), Number(this.number()));
      this.toast.success(`${quarterLabel(q)} créé`);
      await this.router.navigate(['/quarters', q.id]);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
