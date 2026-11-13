import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardTextareaComponent } from '@/shared/components/textarea';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Bet, Quarter, WeeklyReview, errorMessage } from '../core/api';
import { longDay, quarterLabel, shortDay } from '../core/dates';
import { PitchViewComponent } from '../pitch/pitch-view.component';

@Component({
  selector: 'app-weekly-review',
  imports: [
    FormsModule,
    RouterLink,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardTextareaComponent,
    PitchViewComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">Point hebdo</h1>
          <p class="text-sm text-muted-foreground">{{ subtitle() }}</p>
        </div>
      </div>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Chargement…</p>
      } @else if (!review()?.cycle) {
        <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun cycle en cours.
          @if (review()?.next; as c) {
            Le prochain commence le {{ longDay(c.startsOn) }}.
          } @else {
            <a routerLink="/quarters" class="text-primary underline">Ajoutez un cycle</a> à un trimestre.
          }
        </p>
      } @else {
        <section class="flex flex-col gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-semibold">1. Avancement des paris</h2>
            <span class="text-sm text-muted-foreground">10 min · ce qui avance, ce qui bloque, ce qui a été coupé</span>
          </div>

          @if (!bets().length) {
            <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucun pari misé sur ce cycle. Un projet devient un pari quand il est « Misé » sur ce cycle.
            </p>
          } @else {
            <ul class="flex flex-col divide-y rounded-xl border">
              @for (b of bets(); track b.id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/50"
                    [attr.aria-expanded]="open().has(b.id)"
                    [attr.aria-controls]="'bet-' + b.id"
                    (click)="toggle(b.id)"
                  >
                    <span class="text-muted-foreground" aria-hidden="true">{{ open().has(b.id) ? '▾' : '▸' }}</span>
                    <span class="font-medium">{{ b.name }}</span>
                    @if (b.status === 'shipped') {
                      <z-badge zType="outline">Livré</z-badge>
                    }
                    @if (weekNote(b); as n) {
                      <z-badge zType="secondary">Note S{{ n.week }}</z-badge>
                    }
                    <span class="ml-auto text-sm text-muted-foreground">{{ b.owner }}</span>
                    @if (goalsOf(b).length) {
                      <span class="w-full pl-6 text-sm text-muted-foreground">→ {{ goalsOf(b).join(' · ') }}</span>
                    }
                  </button>

                  @if (open().has(b.id)) {
                    <div [id]="'bet-' + b.id" class="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4">
                      @if (week(); as w) {
                        <label class="flex flex-col gap-1.5 text-sm font-medium">
                          Suivi de la semaine {{ w }}
                          <textarea
                            z-textarea
                            rows="3"
                            [ngModel]="drafts()[b.id] ?? ''"
                            (ngModelChange)="write(b.id, $event)"
                            (keydown.control.enter)="saveNote(b)"
                            (keydown.meta.enter)="saveNote(b)"
                            placeholder="Ce qui avance, ce qui bloque, ce qui a été coupé"
                          ></textarea>
                        </label>
                      }

                      <div class="flex flex-wrap gap-2">
                        @if (week()) {
                          <button
                            z-button
                            [zLoading]="busy() === b.id + ':note'"
                            [disabled]="!changed(b)"
                            (click)="saveNote(b)"
                          >
                            Enregistrer la note
                          </button>
                        }
                        @if (b.status === 'bet') {
                          <button z-button zType="outline" [zLoading]="busy() === b.id + ':status'" (click)="setStatus(b, 'shipped')">
                            Marquer livré
                          </button>
                        } @else {
                          <button z-button zType="ghost" [zLoading]="busy() === b.id + ':status'" (click)="setStatus(b, 'bet')">
                            Remettre en cours
                          </button>
                        }
                        <a z-button zType="ghost" [routerLink]="['/projects', b.id]">Ouvrir le projet</a>
                      </div>

                      @if (pastNotes(b).length) {
                        <div class="flex flex-col gap-2">
                          <h3 class="text-sm font-medium">Semaines précédentes</h3>
                          <ul class="flex flex-col gap-2 text-sm">
                            @for (n of pastNotes(b); track n.id) {
                              <li class="rounded-md border bg-background px-3 py-2">
                                <p class="text-xs text-muted-foreground">Semaine {{ n.week }} · {{ n.updatedBy }}</p>
                                <p class="whitespace-pre-line">{{ n.text }}</p>
                              </li>
                            }
                          </ul>
                        </div>
                      }

                      <details class="group rounded-md border bg-background">
                        <summary class="cursor-pointer px-3 py-2 text-sm font-medium">Pitch</summary>
                        <div class="border-t px-4 py-3">
                          @if (b.pitch.trim()) {
                            <app-pitch-view [markdown]="b.pitch" />
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
export class WeeklyReviewPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly loading = signal(true);
  protected readonly review = signal<WeeklyReview | null>(null);
  private readonly quarters = signal<Quarter[]>([]);
  protected readonly open = signal(new Set<string>());
  /** Text being typed, per bet */
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly busy = signal<string | null>(null);

  protected readonly longDay = longDay;
  protected readonly bets = computed(() => this.review()?.bets ?? []);
  protected readonly week = computed(() => this.review()?.week ?? null);

  private readonly cycleLabels = computed(
    () =>
      new Map(
        this.quarters().flatMap((q) =>
          q.cycles.map(
            (c) => [c.id, `${quarterLabel(q)} · cycle ${c.number} (${shortDay(c.startsOn)} → ${shortDay(c.endsOn)})`] as const,
          ),
        ),
      ),
  );

  protected readonly subtitle = computed(() => {
    const r = this.review();
    if (!r?.cycle) return 'Chaque semaine, on fait le point sur les paris du cycle en cours.';
    const name = this.cycleLabels().get(r.cycle.id) ?? `Cycle ${r.cycle.number}`;
    return `${name} · semaine ${r.week} sur 4${r.week === 4 ? ' : point de fin de cycle' : ''}`;
  });

  private readonly goals = computed(
    () => new Map(this.quarters().flatMap((q) => q.goals.map((g) => [g.id, g.title] as const))),
  );

  constructor() {
    this.api.quarters().then((qs) => this.quarters.set(qs)).catch(() => {});
    this.load();
  }

  private async load() {
    try {
      const r = await this.api.weeklyReview();
      this.review.set(r);
      this.drafts.set(Object.fromEntries(r.bets.map((b) => [b.id, this.noteOf(b, r.week)?.text ?? ''])));
      // A single bet: open it right away.
      this.open.set(new Set(r.bets.length === 1 ? [r.bets[0].id] : []));
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected toggle(id: string) {
    this.open.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  protected goalsOf(b: Bet) {
    return b.goalIds.map((id) => this.goals().get(id)).filter((t): t is string => !!t);
  }

  private noteOf(b: Bet, week: number | null) {
    return week ? b.notes.find((n) => n.week === week) : undefined;
  }

  protected weekNote(b: Bet) {
    return this.noteOf(b, this.week());
  }

  protected pastNotes(b: Bet) {
    const w = this.week();
    return w ? b.notes.filter((n) => n.week !== w) : b.notes;
  }

  protected write(id: string, text: string) {
    this.drafts.update((d) => ({ ...d, [id]: text }));
  }

  protected changed(b: Bet) {
    return (this.drafts()[b.id] ?? '').trim() !== (this.noteOf(b, this.week())?.text ?? '');
  }

  protected async saveNote(b: Bet) {
    const w = this.week();
    const cycle = this.review()?.cycle;
    if (!w || !cycle || !this.changed(b)) return;
    this.busy.set(b.id + ':note');
    try {
      const note = await this.api.saveNote(b.id, cycle.id, w, this.drafts()[b.id] ?? '');
      this.updateBet(b.id, (x) => ({
        ...x,
        notes: [...(note ? [note] : []), ...x.notes.filter((n) => n.week !== w)].sort((a, c) => c.week - a.week),
      }));
      this.write(b.id, note?.text ?? '');
      this.toast.success(note ? 'Note enregistrée' : 'Note effacée');
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected async setStatus(b: Bet, status: 'shipped' | 'bet') {
    this.busy.set(b.id + ':status');
    try {
      const updated = await this.api.setStatus(b.id, status);
      this.updateBet(b.id, (x) => ({ ...x, ...updated, notes: x.notes }));
      this.toast.success(status === 'shipped' ? `${b.name} : livré` : `${b.name} : remis en cours`);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  private updateBet(id: string, f: (b: Bet) => Bet) {
    this.review.update((r) => (r ? { ...r, bets: r.bets.map((x) => (x.id === id ? f(x) : x)) } : r));
  }
}
