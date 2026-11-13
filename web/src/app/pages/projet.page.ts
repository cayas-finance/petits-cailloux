import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { Api, Fichier, Projet, ProjetSaisi, STATUTS, STATUTS_AVEC_CYCLE, Statut, Trimestre, messageErreur } from '../core/api';
import { jourCourt, jourLong, libelleTrimestre } from '../core/dates';
import { PitchEditeurComponent } from '../pitch/pitch-editeur.component';
import { PitchRenduComponent } from '../pitch/pitch-rendu.component';

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
    PitchEditeurComponent,
    PitchRenduComponent,
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

              @if (projet()) {
                <div>
                  <button z-button type="submit" [zLoading]="enCours()">Enregistrer</button>
                </div>
              }
            </form>
          </z-card-content>
        </z-card>

        @if (projet(); as p) {
          <z-card>
            <z-card-header>
              <z-card-title>Pitch</z-card-title>
              <z-card-description>Rédigé en markdown, à partir du modèle du guide. Une page maximum.</z-card-description>
            </z-card-header>
            <z-card-content class="flex flex-col gap-4">
              @if (editionPitch()) {
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Mode">
                    <button
                      type="button"
                      class="rounded-md px-3 py-1 text-sm font-medium"
                      [class]="!apercu() ? 'bg-background shadow-sm' : 'text-muted-foreground'"
                      [attr.aria-pressed]="!apercu()"
                      (click)="apercu.set(false)"
                    >
                      Écrire
                    </button>
                    <button
                      type="button"
                      class="rounded-md px-3 py-1 text-sm font-medium"
                      [class]="apercu() ? 'bg-background shadow-sm' : 'text-muted-foreground'"
                      [attr.aria-pressed]="apercu()"
                      (click)="apercu.set(true)"
                    >
                      Aperçu
                    </button>
                  </div>
                  <p class="text-xs text-muted-foreground">Collez ou glissez une image ou un fichier (10 Mo max).</p>
                </div>
                <div [class.hidden]="apercu()">
                  <app-pitch-editeur
                    [projetId]="p.id"
                    [valeur]="brouillon()"
                    (valeurChange)="brouillon.set($event)"
                    (fichierAjoute)="fichiers.update((l) => [...l, $event])"
                  />
                </div>
                @if (apercu()) {
                  <div class="min-h-[420px] rounded-lg border p-4">
                    <app-pitch-rendu [markdown]="brouillon()" />
                  </div>
                }
                <div class="flex gap-2">
                  <button z-button [zLoading]="enCoursPitch()" (click)="enregistrerPitch(p)">Enregistrer le pitch</button>
                  <button z-button zType="outline" (click)="annulerPitch(p)">Annuler</button>
                </div>
              } @else {
                @if (p.pitch.trim()) {
                  <app-pitch-rendu [markdown]="p.pitch" />
                } @else {
                  <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Pas encore de pitch.</p>
                }
                <div class="flex gap-2">
                  <button z-button zType="outline" (click)="ouvrirPitch(p)">Modifier le pitch</button>
                  <a z-button zType="ghost" [routerLink]="['/projets', p.id, 'pitch']">Lire le pitch seul</a>
                </div>
              }

              @if (fichiers().length) {
                <div class="flex flex-col gap-2 border-t pt-4">
                  <h3 class="text-sm font-medium">Fichiers joints</h3>
                  <ul class="flex flex-col gap-1 text-sm">
                    @for (f of fichiers(); track f.id) {
                      <li class="flex items-center justify-between gap-2">
                        <a [href]="f.url" target="_blank" rel="noopener" class="min-w-0 truncate text-primary hover:underline">{{ f.nom }}</a>
                        <span class="flex shrink-0 items-center gap-2 text-muted-foreground">
                          {{ taille(f.taille) }}
                          <button z-button zType="ghost" zSize="sm" class="text-destructive" (click)="retirerFichier(f)">Retirer</button>
                        </span>
                      </li>
                    }
                  </ul>
                </div>
              }
            </z-card-content>
          </z-card>
        } @else {
          <z-card>
            <z-card-header>
              <z-card-title>Pitch</z-card-title>
              <z-card-description>
                Le modèle du guide, à compléter maintenant ou plus tard. Les images et fichiers pourront être joints une fois le projet créé.
              </z-card-description>
            </z-card-header>
            <z-card-content>
              @if (brouillonPret()) {
                <app-pitch-editeur #editeurCreation [valeur]="brouillon()" (valeurChange)="brouillon.set($event)" />
              }
            </z-card-content>
          </z-card>
          <div class="flex gap-2">
            <button z-button [zLoading]="enCours()" (click)="enregistrer()">Créer le projet</button>
            <a z-button zType="outline" routerLink="/projets">Annuler</a>
          </div>
        }
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
  /** ?pitch=edition ouvre directement l'éditeur (après la création) */
  readonly pitch = input<string>();

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

  protected readonly fichiers = signal<Fichier[]>([]);
  protected readonly editionPitch = signal(false);
  protected readonly apercu = signal(false);
  protected readonly brouillon = signal('');
  protected readonly enCoursPitch = signal(false);
  /** Création : le modèle est chargé et son titre suit le nom du projet */
  protected readonly brouillonPret = signal(false);
  private titreModele = '';
  private readonly editeurCreation = viewChild<PitchEditeurComponent>('editeurCreation');

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
    // À la création, le titre du modèle suit le nom saisi tant qu'on ne l'a pas modifié.
    effect(() => {
      const nom = this.nom().trim();
      untracked(() => {
        if (this.projet() || !this.brouillonPret()) return;
        const [premiere, ...reste] = this.brouillon().split('\n');
        if (premiere !== `# ${this.titreModele}`) return;
        this.titreModele = nom || '[Titre court du sujet]';
        const texte = [`# ${this.titreModele}`, ...reste].join('\n');
        this.brouillon.set(texte);
        this.editeurCreation()?.remplacer(texte);
      });
    });
  }

  private async charger(id: string | undefined) {
    this.pret.set(false);
    try {
      const [ts, moi, p, fs, modele] = await Promise.all([
        this.api.trimestres(),
        this.api.moi(),
        id ? this.api.projet(id) : Promise.resolve(null),
        id ? this.api.fichiers(id) : Promise.resolve([]),
        id ? Promise.resolve(null) : this.api.modelePitch(),
      ]);
      if (modele) {
        this.titreModele = '[Titre court du sujet]';
        this.brouillon.set(modele.pitch);
        this.brouillonPret.set(true);
      }
      this.trimestres.set(ts);
      this.fichiers.set(fs);
      this.remplir(p, moi.email);
      this.editionPitch.set(false);
      if (p && this.pitch() === 'edition') this.ouvrirPitch(p);
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
      ...(this.projet() ? {} : { pitch: this.brouillon() }),
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

  protected ouvrirPitch(p: Projet) {
    this.brouillon.set(p.pitch);
    this.apercu.set(false);
    this.editionPitch.set(true);
  }

  protected async enregistrerPitch(p: Projet) {
    this.enCoursPitch.set(true);
    try {
      this.projet.set(await this.api.enregistrerPitch(p.id, this.brouillon()));
      this.editionPitch.set(false);
      this.toast.success('Pitch enregistré');
      if (this.pitch()) await this.router.navigate([], { queryParams: {}, replaceUrl: true });
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.enCoursPitch.set(false);
    }
  }

  protected annulerPitch(p: Projet) {
    const fermer = () => {
      this.editionPitch.set(false);
      if (this.pitch()) this.router.navigate([], { queryParams: {}, replaceUrl: true });
    };
    if (this.brouillon() === p.pitch) return fermer();
    this.alerte.confirm({
      zTitle: 'Abandonner les modifications ?',
      zDescription: 'Les changements du pitch non enregistrés seront perdus.',
      zOkText: 'Abandonner',
      zCancelText: 'Continuer la saisie',
      zOkDestructive: true,
      zOnOk: fermer,
    });
  }

  protected retirerFichier(f: Fichier) {
    this.alerte.confirm({
      zTitle: 'Retirer ce fichier ?',
      zDescription: `« ${f.nom} » sera supprimé. Pensez à retirer son lien du pitch.`,
      zOkText: 'Retirer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: async () => {
        try {
          await this.api.supprimerFichier(f.id);
          this.fichiers.update((l) => l.filter((x) => x.id !== f.id));
          this.toast.success('Fichier retiré');
        } catch (e) {
          this.toast.error(messageErreur(e));
        }
      },
    });
  }

  protected taille(octets: number) {
    if (octets < 1024) return `${octets} o`;
    if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
    return `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  }
}
