import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { Api, Projet, ProjetSaisi, STATUTS, STATUTS_AVEC_CYCLE, Statut, Trimestre, messageErreur } from '../core/api';
import { jourCourt, jourLong, libelleTrimestre } from '../core/dates';

const AUCUN = 'aucun';

@Component({
  selector: 'app-projet',
  imports: [
    FormsModule,
    RouterLink,
    ZardButtonComponent,
    ZardInputComponent,
    ...ZardCardImports,
    ...ZardSelectImports,
  ],
  template: `
    <a routerLink="/projets" class="text-sm text-muted-foreground hover:text-foreground">← Tous les projets</a>

    @if (pret()) {
      <div class="mt-3 flex flex-col gap-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">{{ projet()?.nom || 'Nouveau projet' }}</h1>
            @if (projet(); as p) {
              <p class="text-sm text-muted-foreground">Créé le {{ long(p.creeLe.slice(0, 10)) }} par {{ p.creePar }}</p>
            }
          </div>
          @if (projet(); as p) {
            <button z-button zType="ghost" class="text-destructive" (click)="supprimer(p)">Supprimer le projet</button>
          }
        </div>

        <z-card>
          <z-card-header>
            <z-card-title>Fiche du projet</z-card-title>
            <z-card-description>Un projet misé ou livré est rattaché à un cycle.</z-card-description>
          </z-card-header>
          <z-card-content>
            <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); enregistrer()">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  Nom
                  <input z-input name="nom" [(ngModel)]="nom" required maxlength="200" placeholder="Ex. Import des relevés bancaires" />
                </label>
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  Owner
                  <input z-input type="email" name="owner" [(ngModel)]="owner" required placeholder="prenom@cayas.fr" />
                </label>
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  Statut
                  <z-select [(zValue)]="statut" zPlaceholder="Statut">
                    @for (s of statuts; track s[0]) {
                      <z-select-item [zValue]="s[0]">{{ s[1] }}</z-select-item>
                    }
                  </z-select>
                </label>
                <label class="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  Cycle
                  <z-select [zValue]="cycleId()" (zValueChange)="changerCycle($any($event))" zPlaceholder="Aucun cycle">
                    <z-select-item [zValue]="aucun">Aucun cycle</z-select-item>
                    @for (c of cycles(); track c.id) {
                      <z-select-item [zValue]="c.id">{{ c.libelle }}</z-select-item>
                    }
                  </z-select>
                  @if (cycleRequis()) {
                    <span class="text-xs font-normal text-amber-700 dark:text-amber-400">Choisissez le cycle dans lequel il est pris.</span>
                  }
                </label>
              </div>

              <fieldset class="flex flex-col gap-2">
                <legend class="mb-1.5 text-sm font-medium">Objectifs servis <span class="font-normal text-muted-foreground">(facultatif)</span></legend>
                @for (g of groupesObjectifs(); track g.trimestre) {
                  <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{{ g.trimestre }}</p>
                  @for (o of g.objectifs; track o.id) {
                    <label class="flex items-center gap-2 text-sm">
                      <input type="checkbox" class="size-4 accent-primary" [checked]="objectifIds().includes(o.id)" (change)="basculer(o.id)" />
                      {{ o.titre }}
                    </label>
                  }
                } @empty {
                  <p class="text-sm text-muted-foreground">Aucun objectif défini sur ce trimestre.</p>
                }
              </fieldset>

              <div class="flex gap-2">
                <button z-button type="submit" [zLoading]="enCours()">{{ projet() ? 'Enregistrer' : 'Créer le projet' }}</button>
                @if (!projet()) {
                  <a z-button zType="outline" routerLink="/projets">Annuler</a>
                }
              </div>
            </form>
          </z-card-content>
        </z-card>

        <z-card>
          <z-card-header>
            <z-card-title>Pitch</z-card-title>
            <z-card-description>Documents joints, liens vers une ressource ou saisie markdown : arrive à la prochaine étape.</z-card-description>
          </z-card-header>
        </z-card>
      </div>
    } @else {
      <p class="mt-3 text-sm text-muted-foreground">Chargement…</p>
    }
  `,
})
export class ProjetPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ZardSonnerService);
  private readonly alerte = inject(ZardAlertDialogService);

  readonly id = input<string>();

  protected readonly aucun = AUCUN;
  protected readonly statuts = Object.entries(STATUTS) as [Statut, string][];
  protected readonly long = jourLong;

  protected readonly pret = signal(false);
  protected readonly enCours = signal(false);
  protected readonly projet = signal<Projet | null>(null);
  private readonly trimestres = signal<Trimestre[]>([]);

  protected readonly nom = signal('');
  protected readonly owner = signal('');
  protected readonly statut = signal<string>('recu');
  protected readonly cycleId = signal<string>(AUCUN);
  protected readonly objectifIds = signal<string[]>([]);

  protected readonly cycles = computed(() =>
    this.trimestres().flatMap((t) =>
      t.cycles.map((c) => ({
        id: c.id,
        trimestreId: t.id,
        libelle: `${libelleTrimestre(t)} · cycle ${c.numero} (${jourCourt(c.debut)} → ${jourCourt(c.fin)})`,
      })),
    ),
  );

  protected readonly cycleRequis = computed(
    () => STATUTS_AVEC_CYCLE.includes(this.statut() as Statut) && this.cycleId() === AUCUN,
  );

  /** Avec un cycle : les objectifs de son trimestre. Sans cycle : tous, par trimestre. */
  protected readonly groupesObjectifs = computed(() => {
    const tId = this.cycles().find((c) => c.id === this.cycleId())?.trimestreId;
    return this.trimestres()
      .filter((t) => (tId ? t.id === tId : true))
      .filter((t) => t.objectifs.length)
      .map((t) => ({ trimestre: libelleTrimestre(t), objectifs: t.objectifs }));
  });

  constructor() {
    effect(() => {
      this.charger(this.id());
    });
  }

  private async charger(id: string | undefined) {
    this.pret.set(false);
    try {
      const [ts, moi, p] = await Promise.all([
        this.api.trimestres(),
        this.api.moi(),
        id ? this.api.projet(id) : Promise.resolve(null),
      ]);
      this.trimestres.set(ts);
      this.remplir(p, moi.email);
      this.pret.set(true);
    } catch (e) {
      this.toast.error(messageErreur(e));
      await this.router.navigate(['/projets']);
    }
  }

  private remplir(p: Projet | null, email: string) {
    this.projet.set(p);
    this.nom.set(p?.nom ?? '');
    this.owner.set(p?.owner ?? email);
    this.statut.set(p?.statut ?? 'recu');
    this.cycleId.set(p?.cycleId ?? AUCUN);
    this.objectifIds.set(p?.objectifIds ?? []);
  }

  protected changerCycle(id: string) {
    this.cycleId.set(id || AUCUN);
    // On ne garde que les objectifs du trimestre du cycle choisi.
    const visibles = new Set(this.groupesObjectifs().flatMap((g) => g.objectifs.map((o) => o.id)));
    this.objectifIds.update((ids) => ids.filter((o) => visibles.has(o)));
  }

  protected basculer(id: string) {
    this.objectifIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected async enregistrer() {
    const saisie: ProjetSaisi = {
      nom: this.nom().trim(),
      owner: this.owner().trim(),
      statut: this.statut() as Statut,
      cycleId: this.cycleId() === AUCUN ? null : this.cycleId(),
      objectifIds: this.objectifIds(),
    };
    this.enCours.set(true);
    try {
      const actuel = this.projet();
      if (actuel) {
        this.projet.set(await this.api.modifierProjet(actuel.id, saisie));
        this.toast.success('Projet enregistré');
      } else {
        const p = await this.api.creerProjet(saisie);
        this.toast.success('Projet créé');
        await this.router.navigate(['/projets', p.id]);
      }
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.enCours.set(false);
    }
  }

  protected supprimer(p: Projet) {
    this.alerte.confirm({
      zTitle: 'Supprimer ce projet ?',
      zDescription: `« ${p.nom} » sera supprimé définitivement.`,
      zOkText: 'Supprimer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: async () => {
        try {
          await this.api.supprimerProjet(p.id);
          this.toast.success('Projet supprimé');
          await this.router.navigate(['/projets']);
        } catch (e) {
          this.toast.error(messageErreur(e));
        }
      },
    });
  }
}
