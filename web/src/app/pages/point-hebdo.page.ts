import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardTextareaComponent } from '@/shared/components/textarea';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Pari, PointHebdo, Trimestre, messageErreur } from '../core/api';
import { jourCourt, jourLong, libelleTrimestre } from '../core/dates';
import { PitchRenduComponent } from '../pitch/pitch-rendu.component';

@Component({
  selector: 'app-point-hebdo',
  imports: [
    FormsModule,
    RouterLink,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardTextareaComponent,
    PitchRenduComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Point hebdo</h1>
          <p class="text-sm text-muted-foreground">{{ sousTitre() }}</p>
        </div>
      </div>

      @if (chargement()) {
        <p class="text-sm text-muted-foreground">Chargement…</p>
      } @else if (!point()?.cycle) {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun cycle en cours.
          @if (point()?.prochain; as c) {
            Le prochain commence le {{ jourLong(c.debut) }}.
          } @else {
            <a routerLink="/trimestres" class="text-primary underline">Ajoutez un cycle</a> à un trimestre.
          }
        </p>
      } @else {
        <section class="flex flex-col gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-semibold">1. Avancement des paris</h2>
            <span class="text-sm text-muted-foreground">10 min · ce qui avance, ce qui bloque, ce qui a été coupé</span>
          </div>

          @if (!paris().length) {
            <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucun pari misé sur ce cycle. Un projet devient un pari quand il est « Misé » sur ce cycle.
            </p>
          } @else {
            <ul class="flex flex-col divide-y rounded-xl border">
              @for (p of paris(); track p.id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/50"
                    [attr.aria-expanded]="ouverts().has(p.id)"
                    [attr.aria-controls]="'pari-' + p.id"
                    (click)="basculer(p.id)"
                  >
                    <span class="text-muted-foreground" aria-hidden="true">{{ ouverts().has(p.id) ? '▾' : '▸' }}</span>
                    <span class="font-medium">{{ p.nom }}</span>
                    @if (p.statut === 'livre') {
                      <z-badge zType="outline">Livré</z-badge>
                    }
                    @if (noteSemaine(p); as n) {
                      <z-badge zType="secondary">Note S{{ n.semaine }}</z-badge>
                    }
                    <span class="ml-auto text-sm text-muted-foreground">{{ p.owner }}</span>
                    @if (objectifsDe(p).length) {
                      <span class="w-full pl-6 text-sm text-muted-foreground">→ {{ objectifsDe(p).join(' · ') }}</span>
                    }
                  </button>

                  @if (ouverts().has(p.id)) {
                    <div [id]="'pari-' + p.id" class="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4">
                      @if (semaine(); as s) {
                        <label class="flex flex-col gap-1.5 text-sm font-medium">
                          Suivi de la semaine {{ s }}
                          <textarea
                            z-textarea
                            rows="3"
                            [ngModel]="brouillons()[p.id] ?? ''"
                            (ngModelChange)="ecrire(p.id, $event)"
                            (keydown.control.enter)="enregistrerNote(p)"
                            (keydown.meta.enter)="enregistrerNote(p)"
                            placeholder="Ce qui avance, ce qui bloque, ce qui a été coupé"
                          ></textarea>
                        </label>
                      }

                      <div class="flex flex-wrap gap-2">
                        @if (semaine()) {
                          <button
                            z-button
                            [zLoading]="enCours() === p.id + ':note'"
                            [disabled]="!modifiee(p)"
                            (click)="enregistrerNote(p)"
                          >
                            Enregistrer la note
                          </button>
                        }
                        @if (p.statut === 'mise') {
                          <button z-button zType="outline" [zLoading]="enCours() === p.id + ':statut'" (click)="changerStatut(p, 'livre')">
                            Marquer livré
                          </button>
                        } @else {
                          <button z-button zType="ghost" [zLoading]="enCours() === p.id + ':statut'" (click)="changerStatut(p, 'mise')">
                            Remettre en cours
                          </button>
                        }
                        <a z-button zType="ghost" [routerLink]="['/projets', p.id]">Ouvrir le projet</a>
                      </div>

                      @if (notesPassees(p).length) {
                        <div class="flex flex-col gap-2">
                          <h3 class="text-sm font-medium">Semaines précédentes</h3>
                          <ul class="flex flex-col gap-2 text-sm">
                            @for (n of notesPassees(p); track n.id) {
                              <li class="rounded-md border bg-background px-3 py-2">
                                <p class="text-xs text-muted-foreground">Semaine {{ n.semaine }} · {{ n.majPar }}</p>
                                <p class="whitespace-pre-line">{{ n.texte }}</p>
                              </li>
                            }
                          </ul>
                        </div>
                      }

                      <details class="group rounded-md border bg-background">
                        <summary class="cursor-pointer px-3 py-2 text-sm font-medium">Pitch</summary>
                        <div class="border-t px-4 py-3">
                          @if (p.pitch.trim()) {
                            <app-pitch-rendu [markdown]="p.pitch" />
                          } @else {
                            <p class="text-sm text-muted-foreground">Pas encore de pitch.</p>
                          }
                        </div>
                      </details>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </section>
      }
    </div>
  `,
})
export class PointHebdoPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly chargement = signal(true);
  protected readonly point = signal<PointHebdo | null>(null);
  private readonly trimestres = signal<Trimestre[]>([]);
  protected readonly ouverts = signal(new Set<string>());
  /** Texte en cours de saisie, par pari */
  protected readonly brouillons = signal<Record<string, string>>({});
  protected readonly enCours = signal<string | null>(null);

  protected readonly jourLong = jourLong;
  protected readonly paris = computed(() => this.point()?.paris ?? []);
  protected readonly semaine = computed(() => this.point()?.semaine ?? null);

  protected readonly cycles = computed(() =>
    this.trimestres()
      .flatMap((t) => t.cycles.map((c) => ({ ...c, libelle: `${libelleTrimestre(t)} · cycle ${c.numero} (${jourCourt(c.debut)} → ${jourCourt(c.fin)})` })))
      .sort((a, b) => b.debut.localeCompare(a.debut)),
  );

  protected readonly sousTitre = computed(() => {
    const p = this.point();
    if (!p?.cycle) return 'Chaque semaine, on fait le point sur les paris du cycle en cours.';
    const nom = this.cycles().find((c) => c.id === p.cycle!.id)?.libelle ?? `Cycle ${p.cycle.numero}`;
    return `${nom} · semaine ${p.semaine} sur 4${p.semaine === 4 ? ' : point de fin de cycle' : ''}`;
  });

  private readonly objectifs = computed(
    () => new Map(this.trimestres().flatMap((t) => t.objectifs.map((o) => [o.id, o.titre] as const))),
  );

  constructor() {
    this.api.trimestres().then((ts) => this.trimestres.set(ts)).catch(() => {});
    this.charger();
  }

  private async charger() {
    try {
      const p = await this.api.pointHebdo();
      this.point.set(p);
      this.brouillons.set(Object.fromEntries(p.paris.map((x) => [x.id, this.noteDe(x, p.semaine)?.texte ?? ''])));
      // Un seul pari : on l'ouvre directement.
      this.ouverts.set(new Set(p.paris.length === 1 ? [p.paris[0].id] : []));
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.chargement.set(false);
    }
  }

  protected basculer(id: string) {
    this.ouverts.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  protected objectifsDe(p: Pari) {
    return p.objectifIds.map((id) => this.objectifs().get(id)).filter((t): t is string => !!t);
  }

  private noteDe(p: Pari, semaine: number | null) {
    return semaine ? p.notes.find((n) => n.semaine === semaine) : undefined;
  }

  protected noteSemaine(p: Pari) {
    return this.noteDe(p, this.semaine());
  }

  protected notesPassees(p: Pari) {
    const s = this.semaine();
    return s ? p.notes.filter((n) => n.semaine !== s) : p.notes;
  }

  protected ecrire(id: string, texte: string) {
    this.brouillons.update((b) => ({ ...b, [id]: texte }));
  }

  protected modifiee(p: Pari) {
    return (this.brouillons()[p.id] ?? '').trim() !== (this.noteDe(p, this.semaine())?.texte ?? '');
  }

  protected async enregistrerNote(p: Pari) {
    const s = this.semaine();
    const cycle = this.point()?.cycle;
    if (!s || !cycle || !this.modifiee(p)) return;
    this.enCours.set(p.id + ':note');
    try {
      const note = await this.api.enregistrerNote(p.id, cycle.id, s, this.brouillons()[p.id] ?? '');
      this.majPari(p.id, (x) => ({
        ...x,
        notes: [...(note ? [note] : []), ...x.notes.filter((n) => n.semaine !== s)].sort((a, b) => b.semaine - a.semaine),
      }));
      this.ecrire(p.id, note?.texte ?? '');
      this.toast.success(note ? 'Note enregistrée' : 'Note effacée');
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.enCours.set(null);
    }
  }

  protected async changerStatut(p: Pari, statut: 'livre' | 'mise') {
    this.enCours.set(p.id + ':statut');
    try {
      const maj = await this.api.changerStatut(p.id, statut);
      this.majPari(p.id, (x) => ({ ...x, ...maj, notes: x.notes }));
      this.toast.success(statut === 'livre' ? `${p.nom} : livré` : `${p.nom} : remis en cours`);
    } catch (e) {
      this.toast.error(messageErreur(e));
    } finally {
      this.enCours.set(null);
    }
  }

  private majPari(id: string, f: (p: Pari) => Pari) {
    this.point.update((pt) => (pt ? { ...pt, paris: pt.paris.map((x) => (x.id === id ? f(x) : x)) } : pt));
  }
}
