import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import OverType, { toolbarButtons, type OverTypeInstance } from 'overtype';
import { ZardSonnerService } from '@/shared/components/sonner';
import { Api, Fichier, TAILLE_MAX_FICHIER, messageErreur } from '../core/api';

/** Couleurs de l'éditeur, alignées sur le thème de l'application. */
const THEME = {
  name: 'petits-cailloux',
  colors: {
    bgPrimary: 'var(--background)',
    bgSecondary: 'var(--background)',
    text: 'var(--foreground)',
    textPrimary: 'var(--foreground)',
    textSecondary: 'var(--muted-foreground)',
    h1: 'var(--primary)',
    h2: 'var(--primary)',
    h3: 'var(--primary)',
    strong: 'var(--foreground)',
    em: 'var(--foreground)',
    link: 'var(--primary)',
    code: 'var(--foreground)',
    codeBg: 'var(--muted)',
    blockquote: 'var(--muted-foreground)',
    hr: 'var(--border)',
    listMarker: 'var(--primary)',
    syntaxMarker: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)',
    placeholder: 'var(--muted-foreground)',
    cursor: 'var(--primary)',
    selection: 'color-mix(in oklch, var(--ring) 30%, transparent)',
    border: 'var(--border)',
    primary: 'var(--primary)',
    toolbarBg: 'var(--muted)',
    toolbarBorder: 'var(--border)',
    toolbarIcon: 'var(--foreground)',
    toolbarHover: 'var(--accent)',
    toolbarActive: 'var(--accent)',
    hoverBg: 'var(--accent)',
  },
};

/**
 * Éditeur markdown du pitch (OverType). Les images et fichiers collés,
 * déposés ou choisis avec le bouton d'envoi partent dans R2 via l'API,
 * et leur lien est inséré dans le texte.
 */
@Component({
  selector: 'app-pitch-editeur',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #hote class="overflow-hidden rounded-lg border"></div>`,
})
export class PitchEditeurComponent implements OnDestroy {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);
  private readonly hote = viewChild.required<ElementRef<HTMLElement>>('hote');
  private editeur?: OverTypeInstance;

  readonly projetId = input.required<string>();
  readonly valeur = input.required<string>();
  readonly valeurChange = output<string>();
  readonly fichierAjoute = output<Fichier>();

  constructor() {
    afterNextRender(() => {
      [this.editeur] = new OverType(this.hote().nativeElement, {
        value: this.valeur(),
        theme: THEME,
        fontSize: '14px',
        lineHeight: 1.6,
        padding: '16px',
        autoResize: true,
        minHeight: '420px',
        spellcheck: true,
        placeholder: 'Rédigez le pitch en markdown…',
        toolbar: true,
        toolbarButtons: [
          bouton('h1', 'Titre 1'),
          bouton('h2', 'Titre 2'),
          bouton('h3', 'Titre 3'),
          toolbarButtons.separator,
          bouton('bold', 'Gras (Ctrl+B)'),
          bouton('italic', 'Italique (Ctrl+I)'),
          bouton('code', 'Code'),
          toolbarButtons.separator,
          bouton('link', 'Lien'),
          bouton('bulletList', 'Liste à puces'),
          bouton('orderedList', 'Liste numérotée'),
          bouton('taskList', 'Liste de cases à cocher'),
          bouton('quote', 'Citation'),
          toolbarButtons.separator,
          bouton('upload', 'Joindre une image ou un fichier'),
        ],
        textareaProps: { 'aria-label': 'Pitch en markdown' },
        fileUpload: {
          enabled: true,
          maxSize: TAILLE_MAX_FICHIER,
          onInsertFile: (f) => this.envoyer(f),
        },
        onChange: (v) => this.valeurChange.emit(v),
      });
    });
  }

  private async envoyer(f: File | File[]): Promise<string | string[]> {
    const liste = Array.isArray(f) ? f : [f];
    const liens = await Promise.all(
      liste.map(async (fichier) => {
        try {
          const joint = await this.api.envoyerFichier(this.projetId(), fichier);
          this.fichierAjoute.emit(joint);
          return lienMarkdown(joint);
        } catch (e) {
          this.toast.error(`${fichier.name} : ${messageErreur(e)}`);
          return '';
        }
      }),
    );
    return Array.isArray(f) ? liens : liens[0];
  }

  ngOnDestroy() {
    this.editeur?.destroy();
  }
}

/** Bouton de la barre d'outils, avec son libellé en français. */
function bouton(nom: Exclude<keyof typeof toolbarButtons, 'separator'>, titre: string) {
  return { ...toolbarButtons[nom], title: titre };
}

/** Images affichées dans le pitch ; l'API sert les autres fichiers en téléchargement. */
const IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Lien markdown d'un fichier joint : image affichée, ou lien vers le fichier. */
export function lienMarkdown(f: Pick<Fichier, 'nom' | 'type' | 'url'>): string {
  const texte = f.nom.replace(/[[\]]/g, '');
  return IMAGES.includes(f.type) ? `![${texte}](${f.url})` : `[${texte}](${f.url})`;
}
