import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardTextareaComponent } from '@/shared/components/textarea';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import {
  Api,
  Attachment,
  FORMATS,
  Format,
  Project,
  ProjectInput,
  Quarter,
  SHORT_STATUSES,
  STATUSES,
  STATUSES_WITH_CYCLE,
  Status,
  errorMessage,
} from '../core/api';
import { longDay, quarterLabel, shortDay } from '../core/dates';
import { PitchEditorComponent, removeLink } from '../pitch/pitch-editor.component';
import { PitchViewComponent } from '../pitch/pitch-view.component';
import { BACK_LINKS } from './project-labels';

const NONE = 'none';
const TEMPLATE_TITLE = '[Titre court du sujet]';

@Component({
  selector: 'app-project',
  imports: [
    FormsModule,
    RouterLink,
    ZardButtonComponent,
    ZardInputComponent,
    ZardTextareaComponent,
    ...ZardCardImports,
    ...ZardSelectImports,
    PitchEditorComponent,
    PitchViewComponent,
  ],
  template: `
    @if (back(); as b) {
      <a [routerLink]="b.url" class="text-sm text-muted-foreground hover:text-foreground">← {{ b.label }}</a>
    } @else {
      <a routerLink="/projects" class="text-sm text-muted-foreground hover:text-foreground">← Tous les projets</a>
    }

    @if (ready()) {
      <div class="mt-3 flex flex-col gap-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">{{ project()?.name || 'Nouveau projet' }}</h1>
            @if (project(); as p) {
              <p class="text-sm text-muted-foreground">Créé le {{ long(p.createdAt.slice(0, 10)) }} par {{ p.createdBy }}</p>
            }
          </div>
          @if (project(); as p) {
            <div class="flex gap-2">
              @if (p.format === 'short') {
                <button z-button zType="outline" [zLoading]="saving()" (click)="promote(p)">En faire un pari</button>
              }
              <button z-button zType="ghost" class="text-destructive" (click)="delete(p)">Supprimer le projet</button>
            </div>
          }
        </div>

        <z-card>
          <z-card-header>
            <z-card-title>Fiche du projet</z-card-title>
            <z-card-description>
              @if (format() === 'short') {
                Un sujet court se décide au point hebdo, sans shaping. Il n’a pas d’owner, juste un demandeur.
              } @else {
                Un projet misé ou livré est rattaché à un cycle.
              }
            </z-card-description>
          </z-card-header>
          <z-card-content>
            <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  Nom
                  <input z-input name="name" [(ngModel)]="name" required maxlength="200" placeholder="Ex. Import des relevés bancaires" />
                </label>
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  Format
                  @if (project(); as p) {
                    <span class="py-2 font-normal">{{ formats[p.format] }}</span>
                  } @else {
                    <z-select [zValue]="format()" (zValueChange)="changeFormat($any($event))" zPlaceholder="Format">
                      @for (f of formatList; track f[0]) {
                        <z-select-item [zValue]="f[0]">{{ f[1] }}</z-select-item>
                      }
                    </z-select>
                  }
                </label>
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  Statut
                  <z-select [(zValue)]="status" zPlaceholder="Statut">
                    @for (s of statusList(); track s[0]) {
                      <z-select-item [zValue]="s[0]">{{ s[1] }}</z-select-item>
                    }
                  </z-select>
                </label>
                @if (format() === 'bet') {
                  <label class="flex flex-col gap-1.5 text-sm font-medium">
                    Owner
                    <input z-input type="email" name="owner" [(ngModel)]="owner" required placeholder="prenom@cayas.fr" />
                  </label>
                }
                <label class="flex flex-col gap-1.5 text-sm font-medium" [class.sm:col-span-2]="format() === 'short'">
                  <span>
                    Demandeur
                    @if (format() === 'bet') {
                      <span class="font-normal text-muted-foreground">(facultatif)</span>
                    }
                  </span>
                  <input z-input name="requester" [(ngModel)]="requester" maxlength="200" placeholder="Ex. Nico, pour le client Dupont" />
                </label>
                <label class="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  Cycle
                  <z-select [zValue]="cycleId()" (zValueChange)="changeCycle($any($event))" zPlaceholder="Aucun cycle">
                    <z-select-item [zValue]="none">Aucun cycle</z-select-item>
                    @for (c of cycles(); track c.id) {
                      <z-select-item [zValue]="c.id">{{ c.label }}</z-select-item>
                    }
                  </z-select>
                  @if (cycleRequired()) {
                    <span class="text-xs font-normal text-amber-700 dark:text-amber-400">Choisissez le cycle dans lequel il est pris.</span>
                  }
                </label>
              </div>

              <fieldset class="flex flex-col gap-2">
                <legend class="mb-1.5 text-sm font-medium">Objectifs servis <span class="font-normal text-muted-foreground">(facultatif)</span></legend>
                @for (group of goalGroups(); track group.quarter) {
                  <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{{ group.quarter }}</p>
                  @for (g of group.goals; track g.id) {
                    <label class="flex items-center gap-2 text-sm">
                      <input type="checkbox" class="size-4 accent-primary" [checked]="goalIds().includes(g.id)" (change)="toggle(g.id)" />
                      {{ g.title }}
                    </label>
                  }
                } @empty {
                  <p class="text-sm text-muted-foreground">Aucun objectif défini sur ce trimestre.</p>
                }
              </fieldset>

              @if (project()) {
                <div>
                  <button z-button type="submit" [zLoading]="saving()">Enregistrer</button>
                </div>
              }
            </form>
          </z-card-content>
        </z-card>

        @if (project(); as p) {
          <z-card>
            <z-card-header>
              @if (p.format === 'short') {
                <z-card-title>Problème</z-card-title>
                <z-card-description>Quelques lignes en markdown : la situation vécue et ce qu’on attend.</z-card-description>
              } @else {
                <z-card-title>Pitch</z-card-title>
                <z-card-description>Rédigé en markdown, à partir du modèle du guide. Une page maximum.</z-card-description>
              }
            </z-card-header>
            <z-card-content class="flex flex-col gap-4">
              @if (editingPitch()) {
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Mode">
                    <button
                      type="button"
                      class="rounded-md px-3 py-1 text-sm font-medium"
                      [class]="!preview() ? 'bg-background shadow-sm' : 'text-muted-foreground'"
                      [attr.aria-pressed]="!preview()"
                      (click)="preview.set(false)"
                    >
                      Écrire
                    </button>
                    <button
                      type="button"
                      class="rounded-md px-3 py-1 text-sm font-medium"
                      [class]="preview() ? 'bg-background shadow-sm' : 'text-muted-foreground'"
                      [attr.aria-pressed]="preview()"
                      (click)="preview.set(true)"
                    >
                      Aperçu
                    </button>
                  </div>
                  <div class="flex gap-2">
                    <button z-button zType="outline" (click)="cancelPitch(p)">Annuler</button>
                    <button z-button [zLoading]="savingPitch()" (click)="savePitch(p)">Enregistrer</button>
                  </div>
                </div>
                <p class="-mt-2 text-xs text-muted-foreground">Collez ou glissez une image ou un fichier (10 Mo max).</p>
                <div [class.hidden]="preview()">
                  <app-pitch-editor
                    #pitchEditor
                    [projectId]="p.id"
                    [value]="draft()"
                    (valueChange)="draft.set($event)"
                    (attachmentAdded)="attachments.update((l) => [...l, $event])"
                  />
                </div>
                @if (preview()) {
                  <div class="min-h-[420px] rounded-lg border p-4">
                    <app-pitch-view [markdown]="draft()" />
                  </div>
                }
              } @else {
                <div class="flex gap-2">
                  <button z-button zType="outline" (click)="openPitch(p)">{{ p.format === 'short' ? 'Modifier le problème' : 'Modifier le pitch' }}</button>
                  <a z-button zType="ghost" [routerLink]="['/projects', p.id, 'pitch']" [queryParams]="from() ? { from: from() } : {}">{{ p.format === 'short' ? 'Lire le sujet seul' : 'Lire le pitch seul' }}</a>
                </div>
                @if (p.pitch.trim()) {
                  <app-pitch-view [markdown]="p.pitch" />
                } @else {
                  <p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {{ p.format === 'short' ? 'Problème non décrit.' : 'Pas encore de pitch.' }}
                  </p>
                }
              }

              @if (attachments().length) {
                <div class="flex flex-col gap-2 border-t pt-4">
                  <h3 class="text-sm font-medium">Fichiers joints</h3>
                  <ul class="flex flex-col gap-1 text-sm">
                    @for (a of attachments(); track a.id) {
                      <li class="flex items-center justify-between gap-2">
                        <a [href]="a.url" target="_blank" rel="noopener" class="min-w-0 truncate text-primary hover:underline">{{ a.filename }}</a>
                        <span class="flex shrink-0 items-center gap-2 text-muted-foreground">
                          {{ size(a.size) }}
                          <button z-button zType="ghost" zSize="sm" class="text-destructive" (click)="removeAttachment(a)">Retirer</button>
                        </span>
                      </li>
                    }
                  </ul>
                </div>
              }
            </z-card-content>
          </z-card>
        } @else {
          @if (format() === 'short') {
            <z-card>
              <z-card-header>
                <z-card-title>Problème</z-card-title>
                <z-card-description>Le pitch court : la situation vécue, en quelques lignes.</z-card-description>
              </z-card-header>
              <z-card-content>
                <textarea z-textarea rows="5" class="w-full" aria-label="Problème" [(ngModel)]="problem" placeholder="Ce qui se passe, pour qui, et ce qu’on attend"></textarea>
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
                @if (draftReady()) {
                  <app-pitch-editor #creationEditor [value]="draft()" (valueChange)="draft.set($event)" />
                }
              </z-card-content>
            </z-card>
          }
          <div class="flex gap-2">
            <button z-button [zLoading]="saving()" (click)="save()">Créer le projet</button>
            <a z-button zType="outline" routerLink="/projects">Annuler</a>
          </div>
        }
      </div>
    } @else {
      <p class="mt-3 text-sm text-muted-foreground">Chargement…</p>
    }
  `,
})
export class ProjectPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ZardSonnerService);
  private readonly alert = inject(ZardAlertDialogService);

  readonly id = input<string>();
  /** ?pitch=edit opens the editor directly */
  readonly pitch = input<string>();
  /** ?from=weekly-review or roadmap: the back link returns to that page */
  readonly from = input<string>();
  protected readonly back = computed(() => BACK_LINKS[this.from() ?? '']);

  protected readonly none = NONE;
  protected readonly formats = FORMATS;
  protected readonly formatList = Object.entries(FORMATS) as [Format, string][];
  protected readonly long = longDay;

  protected readonly ready = signal(false);
  protected readonly saving = signal(false);
  protected readonly project = signal<Project | null>(null);
  private readonly quarters = signal<Quarter[]>([]);

  protected readonly name = signal('');
  protected readonly format = signal<Format>('bet');
  protected readonly owner = signal('');
  protected readonly requester = signal('');
  /** Problem of a new short topic */
  protected readonly problem = signal('');
  protected readonly status = signal<string>('received');
  protected readonly cycleId = signal<string>(NONE);
  protected readonly goalIds = signal<string[]>([]);

  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly editingPitch = signal(false);
  protected readonly preview = signal(false);
  protected readonly draft = signal('');
  protected readonly savingPitch = signal(false);
  /** Creation: the template is loaded and its title follows the project name */
  protected readonly draftReady = signal(false);
  private templateTitle = '';
  private readonly creationEditor = viewChild<PitchEditorComponent>('creationEditor');
  private readonly pitchEditor = viewChild<PitchEditorComponent>('pitchEditor');

  protected readonly cycles = computed(() =>
    this.quarters().flatMap((q) =>
      q.cycles.map((c) => ({
        id: c.id,
        quarterId: q.id,
        label: `${quarterLabel(q)} · cycle ${c.number} (${shortDay(c.startsOn)} → ${shortDay(c.endsOn)})`,
      })),
    ),
  );

  protected readonly statusList = computed(
    () => Object.entries(this.format() === 'short' ? SHORT_STATUSES : STATUSES) as [Status, string][],
  );

  protected readonly cycleRequired = computed(
    () => STATUSES_WITH_CYCLE.includes(this.status() as Status) && this.cycleId() === NONE,
  );

  /** With a cycle: the goals of its quarter. Without: all of them, by quarter. */
  protected readonly goalGroups = computed(() => {
    const quarterId = this.cycles().find((c) => c.id === this.cycleId())?.quarterId;
    return this.quarters()
      .filter((q) => (quarterId ? q.id === quarterId : true))
      .filter((q) => q.goals.length)
      .map((q) => ({ quarter: quarterLabel(q), goals: q.goals }));
  });

  constructor() {
    effect(() => {
      this.load(this.id());
    });
    // On creation, the template title follows the typed name until it is edited by hand.
    effect(() => {
      const name = this.name().trim();
      untracked(() => {
        if (this.project() || !this.draftReady()) return;
        const [first, ...rest] = this.draft().split('\n');
        if (first !== `# ${this.templateTitle}`) return;
        this.templateTitle = name || TEMPLATE_TITLE;
        const text = [`# ${this.templateTitle}`, ...rest].join('\n');
        this.draft.set(text);
        this.creationEditor()?.replace(text);
      });
    });
  }

  private async load(id: string | undefined) {
    this.ready.set(false);
    try {
      const [qs, me, p, as, template] = await Promise.all([
        this.api.quarters(),
        this.api.me(),
        id ? this.api.project(id) : Promise.resolve(null),
        id ? this.api.attachments(id) : Promise.resolve([]),
        id ? Promise.resolve(null) : this.api.pitchTemplate(),
      ]);
      if (template) {
        this.templateTitle = TEMPLATE_TITLE;
        this.draft.set(template.pitch);
        this.draftReady.set(true);
      }
      this.quarters.set(qs);
      this.attachments.set(as);
      this.fill(p, me.email);
      this.editingPitch.set(false);
      if (p && this.pitch() === 'edit') this.openPitch(p);
      this.ready.set(true);
    } catch (e) {
      this.toast.error(errorMessage(e));
      await this.router.navigate(['/projects']);
    }
  }

  private fill(p: Project | null, email: string) {
    this.project.set(p);
    this.name.set(p?.name ?? '');
    this.format.set(p?.format ?? 'bet');
    this.owner.set(p?.owner ?? email);
    this.requester.set(p?.requester ?? '');
    this.problem.set('');
    this.status.set(p?.status ?? 'received');
    this.cycleId.set(p?.cycleId ?? NONE);
    this.goalIds.set(p?.goalIds ?? []);
  }

  protected changeFormat(f: Format) {
    this.format.set(f);
    if (f === 'short' && !(this.status() in SHORT_STATUSES)) this.status.set('received');
  }

  protected changeCycle(id: string) {
    this.cycleId.set(id || NONE);
    // Only keep the goals of the chosen cycle's quarter.
    const visible = new Set(this.goalGroups().flatMap((g) => g.goals.map((goal) => goal.id)));
    this.goalIds.update((ids) => ids.filter((g) => visible.has(g)));
  }

  protected toggle(id: string) {
    this.goalIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected async save() {
    const data: ProjectInput = {
      name: this.name().trim(),
      format: this.format(),
      ...(this.format() === 'bet' ? { owner: this.owner().trim() } : {}),
      requester: this.requester().trim(),
      status: this.status() as Status,
      cycleId: this.cycleId() === NONE ? null : this.cycleId(),
      goalIds: this.goalIds(),
      ...(this.project() ? {} : { pitch: this.format() === 'short' ? this.problem() : this.draft() }),
    };
    this.saving.set(true);
    try {
      const current = this.project();
      if (current) {
        this.project.set(await this.api.updateProject(current.id, data));
        this.toast.success('Projet enregistré');
      } else {
        const p = await this.api.createProject(data);
        this.toast.success('Projet créé');
        await this.router.navigate(['/projects', p.id]);
      }
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected delete(p: Project) {
    this.alert.confirm({
      zTitle: 'Supprimer ce projet ?',
      zDescription: `« ${p.name} » sera supprimé définitivement.`,
      zOkText: 'Supprimer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: async () => {
        try {
          await this.api.deleteProject(p.id);
          this.toast.success('Projet supprimé');
          await this.router.navigate(['/projects']);
        } catch (e) {
          this.toast.error(errorMessage(e));
        }
      },
    });
  }

  protected promote(p: Project) {
    this.alert.confirm({
      zTitle: 'En faire un pari ?',
      zDescription: `« ${p.name} » passe en shaping, avec vous comme owner. Le problème est repris dans le modèle du pitch.`,
      zOkText: 'En faire un pari',
      zCancelText: 'Annuler',
      zOnOk: async () => {
        this.saving.set(true);
        try {
          const updated = await this.api.promote(p.id);
          this.fill(updated, updated.owner ?? '');
          this.toast.success('C’est maintenant un pari, en shaping');
        } catch (e) {
          this.toast.error(errorMessage(e));
        } finally {
          this.saving.set(false);
        }
      },
    });
  }

  protected openPitch(p: Project) {
    this.draft.set(p.pitch);
    this.preview.set(false);
    this.editingPitch.set(true);
  }

  protected async savePitch(p: Project) {
    this.savingPitch.set(true);
    try {
      this.project.set(await this.api.savePitch(p.id, this.draft()));
      this.editingPitch.set(false);
      this.toast.success(p.format === 'short' ? 'Problème enregistré' : 'Pitch enregistré');
      if (this.pitch()) await this.router.navigate([], { queryParams: { pitch: null }, queryParamsHandling: 'merge', replaceUrl: true });
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.savingPitch.set(false);
    }
  }

  protected cancelPitch(p: Project) {
    const close = () => {
      this.editingPitch.set(false);
      if (this.pitch()) this.router.navigate([], { queryParams: { pitch: null }, queryParamsHandling: 'merge', replaceUrl: true });
    };
    if (this.draft() === p.pitch) return close();
    this.alert.confirm({
      zTitle: 'Abandonner les modifications ?',
      zDescription: 'Les changements du pitch non enregistrés seront perdus.',
      zOkText: 'Abandonner',
      zCancelText: 'Continuer la saisie',
      zOkDestructive: true,
      zOnOk: close,
    });
  }

  protected removeAttachment(a: Attachment) {
    this.alert.confirm({
      zTitle: 'Retirer ce fichier ?',
      zDescription: `« ${a.filename} » sera supprimé, ainsi que son lien dans le pitch.`,
      zOkText: 'Retirer',
      zCancelText: 'Annuler',
      zOkDestructive: true,
      zOnOk: async () => {
        try {
          const updated = await this.api.deleteAttachment(a.id);
          this.attachments.update((l) => l.filter((x) => x.id !== a.id));
          if (updated) this.project.set(updated);
          if (this.editingPitch()) {
            // The draft may contain the link even if it is not saved yet.
            const text = removeLink(this.draft(), a.url);
            this.draft.set(text);
            this.pitchEditor()?.replace(text);
          }
          this.toast.success('Fichier retiré');
        } catch (e) {
          this.toast.error(errorMessage(e));
        }
      },
    });
  }

  protected size(bytes: number) {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  }
}
