import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardTextareaComponent } from '@/shared/components/textarea';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Announcement, Api, Bet, Project, Quarter, WeeklyReview, errorMessage } from '../core/api';
import { announcementsForSlack } from '../core/slack';
import { longDay, quarterLabel, shortDay } from '../core/dates';
import { PitchViewComponent } from '../pitch/pitch-view.component';
import { ProjectPanelComponent } from './project-panel.component';

@Component({
  selector: 'app-weekly-review',
  imports: [
    FormsModule,
    RouterLink,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardInputComponent,
    ZardTextareaComponent,
    PitchViewComponent,
    ProjectPanelComponent,
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
                        <button z-button zType="ghost" (click)="show(b)">Voir le projet</button>
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

        <section class="flex flex-col gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-semibold">2. Sujets courts</h2>
            <span class="text-sm text-muted-foreground">Posés en direct, décidés tout de suite, sans shaping</span>
          </div>

          @if (!adding()) {
            <div>
              <button z-button zType="outline" (click)="openForm()">Ajouter un sujet court</button>
            </div>
          } @else {
            <form class="flex flex-col gap-3 rounded-xl border p-4" (submit)="$event.preventDefault(); addShortTopic()" (keydown.escape)="closeForm()">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  Titre
                  <input z-input #titleInput name="title" [(ngModel)]="newTitle" maxlength="200" placeholder="Ex. Export CSV des écritures" />
                </label>
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  Demandeur
                  <input z-input name="requester" [(ngModel)]="newRequester" maxlength="200" placeholder="Ex. Nico, pour le client Dupont" />
                </label>
              </div>
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                Problème
                <textarea z-textarea name="problem" rows="2" [(ngModel)]="newProblem" placeholder="La situation vécue, en quelques lignes"></textarea>
              </label>
              <div class="flex gap-2">
                <button z-button type="submit" [zLoading]="busy() === 'new'">Poser le sujet</button>
                <button z-button type="button" zType="ghost" (click)="closeForm()">Annuler</button>
              </div>
            </form>
          }

          @if (shortTopics().pending.length) {
            <h3 class="text-sm font-medium">À décider</h3>
            <ul class="flex flex-col divide-y rounded-xl border">
              @for (t of shortTopics().pending; track t.id) {
                <li class="flex flex-col gap-2 px-4 py-3">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button type="button" class="font-medium hover:underline" (click)="show(t)">{{ t.name }}</button>
                    @if (t.status === 'waiting') {
                      <z-badge zType="secondary">Pas maintenant</z-badge>
                    }
                    <span class="ml-auto text-sm text-muted-foreground">Demandé par {{ t.requester }}</span>
                  </div>
                  @if (t.pitch.trim()) {
                    <app-pitch-view [markdown]="t.pitch" />
                  }
                  <div class="flex flex-wrap gap-2">
                    <button z-button zSize="sm" [zLoading]="busy() === t.id + ':take'" (click)="decide(t, 'take')">On le fait</button>
                    @if (t.status !== 'waiting') {
                      <button z-button zSize="sm" zType="outline" [zLoading]="busy() === t.id + ':later'" (click)="decide(t, 'later')">Pas maintenant</button>
                    }
                    <button z-button zSize="sm" zType="outline" [zLoading]="busy() === t.id + ':promote'" (click)="decide(t, 'promote')">En faire un pari</button>
                    <button z-button zSize="sm" zType="ghost" class="text-destructive" [zLoading]="busy() === t.id + ':drop'" (click)="decide(t, 'drop')">Écarter</button>
                  </div>
                </li>
              }
            </ul>
          }

          @if (shortTopics().current.length) {
            <h3 class="text-sm font-medium">Pris dans ce cycle</h3>
            <ul class="flex flex-col divide-y rounded-xl border">
              @for (t of shortTopics().current; track t.id) {
                <li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <button type="button" class="font-medium hover:underline" (click)="show(t)">{{ t.name }}</button>
                  @if (t.status === 'shipped') {
                    <z-badge zType="outline">Livré</z-badge>
                  }
                  <span class="text-sm text-muted-foreground">Demandé par {{ t.requester }}</span>
                  <span class="ml-auto">
                    @if (t.status === 'bet') {
                      <button z-button zSize="sm" zType="outline" [zLoading]="busy() === t.id + ':status'" (click)="setShortStatus(t, 'shipped')">
                        Marquer livré
                      </button>
                    } @else {
                      <button z-button zSize="sm" zType="ghost" [zLoading]="busy() === t.id + ':status'" (click)="setShortStatus(t, 'bet')">
                        Remettre en cours
                      </button>
                    }
                  </span>
                </li>
              }
            </ul>
          }

          @if (!shortTopics().pending.length && !shortTopics().current.length) {
            <p class="text-sm text-muted-foreground">Aucun sujet court en attente ni en cours.</p>
          }
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-semibold">3. Infos à diffuser</h2>
            <span class="text-sm text-muted-foreground">Ce que toute l’équipe doit savoir cette semaine</span>
          </div>

          @if (announcements().length) {
            <ul class="flex flex-col divide-y rounded-xl border">
              @for (a of announcements(); track a.id) {
                <li class="flex flex-col gap-2 px-4 py-3">
                  @if (editingAnnouncement() === a.id) {
                    <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); saveAnnouncement(a)" (keydown.escape)="editingAnnouncement.set(null)">
                      <textarea
                        z-textarea
                        #announcementEdit
                        rows="2"
                        name="edit"
                        aria-label="Info à diffuser"
                        [(ngModel)]="announcementDraft"
                      ></textarea>
                      <div class="flex gap-2">
                        <button z-button zSize="sm" type="submit" [zLoading]="busy() === a.id + ':save'">Enregistrer</button>
                        <button z-button zSize="sm" type="button" zType="ghost" (click)="editingAnnouncement.set(null)">Annuler</button>
                      </div>
                    </form>
                  } @else {
                    <p class="text-sm whitespace-pre-line">{{ a.text }}</p>
                    <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{{ a.createdBy }}</span>
                      <span class="ml-auto flex gap-1">
                        <button z-button zSize="sm" zType="ghost" (click)="editAnnouncement(a)">Modifier</button>
                        <button z-button zSize="sm" zType="ghost" class="text-destructive" [zLoading]="busy() === a.id + ':delete'" (click)="deleteAnnouncement(a)">
                          Retirer
                        </button>
                      </span>
                    </div>
                  }
                </li>
              }
            </ul>
          } @else if (!addingAnnouncement()) {
            <p class="text-sm text-muted-foreground">Aucune info cette semaine.</p>
          }

          @if (addingAnnouncement()) {
            <form class="flex flex-col gap-3 rounded-xl border p-4" (submit)="$event.preventDefault(); addAnnouncement()" (keydown.escape)="closeAnnouncementForm()">
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                Info
                <textarea
                  z-textarea
                  #announcementInput
                  name="announcement"
                  rows="2"
                  [(ngModel)]="newAnnouncement"
                  placeholder="Ex. Mise en production jeudi soir, prévenir les clients de l’accompagnement"
                ></textarea>
              </label>
              <div class="flex gap-2">
                <button z-button type="submit" [zLoading]="busy() === 'announcement'">Ajouter l’info</button>
                <button z-button type="button" zType="ghost" (click)="closeAnnouncementForm()">Annuler</button>
              </div>
            </form>
          } @else {
            <div class="flex flex-wrap gap-2">
              <button z-button zType="outline" (click)="addingAnnouncement.set(true)">Ajouter une info</button>
              @if (announcements().length) {
                <button z-button zType="ghost" (click)="copyForSlack()">Copier pour Slack</button>
              }
            </div>
          }
        </section>
      }
    </div>

    @if (shown(); as p) {
      <app-project-panel [project]="p" [quarters]="quarters()" (closed)="hide()" />
    }
  `,
})
export class WeeklyReviewPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);

  protected readonly loading = signal(true);
  protected readonly review = signal<WeeklyReview | null>(null);
  protected readonly quarters = signal<Quarter[]>([]);
  /** Project opened in the side panel */
  protected readonly shown = signal<Project | null>(null);
  private opener: HTMLElement | null = null;
  protected readonly open = signal(new Set<string>());
  /** Text being typed, per bet */
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly busy = signal<string | null>(null);

  protected readonly longDay = longDay;
  protected readonly bets = computed(() => this.review()?.bets ?? []);
  protected readonly shortTopics = computed(() => this.review()?.shortTopics ?? { pending: [], current: [] });

  protected readonly announcements = computed(() => this.review()?.announcements ?? []);
  protected readonly addingAnnouncement = signal(false);
  protected readonly newAnnouncement = signal('');
  protected readonly editingAnnouncement = signal<string | null>(null);
  protected readonly announcementDraft = signal('');
  private readonly announcementInput = viewChild('announcementInput', { read: ElementRef<HTMLTextAreaElement> });
  private readonly announcementEdit = viewChild('announcementEdit', { read: ElementRef<HTMLTextAreaElement> });

  /** The short topic form is folded until someone adds a topic */
  protected readonly adding = signal(false);
  private readonly titleInput = viewChild('titleInput', { read: ElementRef<HTMLInputElement> });
  protected readonly newTitle = signal('');
  protected readonly newRequester = signal('');
  protected readonly newProblem = signal('');
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
    // Focus the title as soon as the short topic form unfolds.
    effect(() => this.titleInput()?.nativeElement.focus());
    effect(() => this.announcementInput()?.nativeElement.focus());
    effect(() => this.announcementEdit()?.nativeElement.focus());
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

  protected show(p: Project) {
    this.opener = document.activeElement as HTMLElement | null;
    this.shown.set(p);
  }

  protected hide() {
    this.shown.set(null);
    // Give the focus back to the button that opened the panel.
    this.opener?.focus();
    this.opener = null;
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

  protected openForm() {
    this.adding.set(true);
  }

  protected closeForm() {
    this.adding.set(false);
    this.newTitle.set('');
    this.newRequester.set('');
    this.newProblem.set('');
  }

  protected async addShortTopic() {
    const name = this.newTitle().trim();
    const requester = this.newRequester().trim();
    if (!name || !requester) {
      this.toast.error('Donnez au moins un titre et un demandeur.');
      return;
    }
    this.busy.set('new');
    try {
      const t = await this.api.createProject({
        name,
        format: 'short',
        requester,
        status: 'received',
        cycleId: null,
        goalIds: [],
        pitch: this.newProblem().trim(),
      });
      this.updateShortTopics((s) => ({ ...s, pending: [...s.pending, t] }));
      this.closeForm();
      this.toast.success('Sujet posé');
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  /** Decisions on a short topic: take it in the current cycle, put it aside, drop it, or make it a bet. */
  protected async decide(t: Project, decision: 'take' | 'later' | 'drop' | 'promote') {
    const cycle = this.review()?.cycle;
    if (!cycle) return;
    this.busy.set(`${t.id}:${decision}`);
    try {
      let updated: Project;
      if (decision === 'take') updated = await this.api.setStatus(t.id, 'bet', cycle.id);
      else if (decision === 'later') updated = await this.api.setStatus(t.id, 'waiting', null);
      else if (decision === 'drop') updated = await this.api.setStatus(t.id, 'dropped', null);
      else updated = await this.api.promote(t.id);
      this.updateShortTopics((s) => ({
        pending: decision === 'later' ? s.pending.map((x) => (x.id === t.id ? updated : x)) : s.pending.filter((x) => x.id !== t.id),
        current: decision === 'take' ? [...s.current, updated] : s.current,
      }));
      const messages = {
        take: 'pris dans le cycle',
        later: 'pas maintenant',
        drop: 'écarté',
        promote: 'devient un pari, en shaping',
      };
      this.toast.success(`${t.name} : ${messages[decision]}`);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected async setShortStatus(t: Project, status: 'shipped' | 'bet') {
    this.busy.set(t.id + ':status');
    try {
      const updated = await this.api.setStatus(t.id, status);
      this.updateShortTopics((s) => ({ ...s, current: s.current.map((x) => (x.id === t.id ? updated : x)) }));
      this.toast.success(status === 'shipped' ? `${t.name} : livré` : `${t.name} : remis en cours`);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected closeAnnouncementForm() {
    this.addingAnnouncement.set(false);
    this.newAnnouncement.set('');
  }

  protected async addAnnouncement() {
    const text = this.newAnnouncement().trim();
    if (!text) {
      this.toast.error('L’info est vide.');
      return;
    }
    this.busy.set('announcement');
    try {
      const a = await this.api.addAnnouncement(text);
      this.updateAnnouncements((l) => [...l, a]);
      this.closeAnnouncementForm();
      this.toast.success('Info ajoutée');
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected editAnnouncement(a: Announcement) {
    this.announcementDraft.set(a.text);
    this.editingAnnouncement.set(a.id);
  }

  protected async saveAnnouncement(a: Announcement) {
    this.busy.set(a.id + ':save');
    try {
      const updated = await this.api.updateAnnouncement(a.id, this.announcementDraft());
      this.updateAnnouncements((l) => l.map((x) => (x.id === a.id ? updated : x)));
      this.editingAnnouncement.set(null);
      this.toast.success('Info modifiée');
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected async deleteAnnouncement(a: Announcement) {
    this.busy.set(a.id + ':delete');
    try {
      await this.api.deleteAnnouncement(a.id);
      this.updateAnnouncements((l) => l.filter((x) => x.id !== a.id));
      this.toast.success('Info retirée');
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  protected async copyForSlack() {
    const r = this.review();
    if (!r?.cycle) return;
    const name = this.cycleLabels().get(r.cycle.id)?.split(' (')[0] ?? `Cycle ${r.cycle.number}`;
    const text = announcementsForSlack(`Infos à diffuser · ${name}, semaine ${r.week}`, this.announcements());
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copié : prêt à coller dans Slack');
    } catch {
      this.toast.error('Impossible de copier. Sélectionnez le texte à la main.');
    }
  }

  private updateAnnouncements(f: (l: Announcement[]) => Announcement[]) {
    this.review.update((r) => (r ? { ...r, announcements: f(r.announcements) } : r));
  }

  private updateShortTopics(f: (s: WeeklyReview['shortTopics']) => WeeklyReview['shortTopics']) {
    this.review.update((r) => (r ? { ...r, shortTopics: f(r.shortTopics) } : r));
  }

  private updateBet(id: string, f: (b: Bet) => Bet) {
    this.review.update((r) => (r ? { ...r, bets: r.bets.map((x) => (x.id === id ? f(x) : x)) } : r));
  }
}
