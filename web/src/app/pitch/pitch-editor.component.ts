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
import { Api, Attachment, MAX_ATTACHMENT_SIZE, errorMessage } from '../core/api';

/** Editor colours, matching the application theme. */
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
 * Markdown editor for the pitch (OverType). Images and files that are pasted,
 * dropped or picked with the upload button go to R2 through the API, and
 * their link is inserted in the text.
 */
@Component({
  selector: 'app-pitch-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="overflow-hidden rounded-lg border"></div>`,
})
export class PitchEditorComponent implements OnDestroy {
  private readonly api = inject(Api);
  private readonly toast = inject(ZardSonnerService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private editor?: OverTypeInstance;

  /** Without a project (creation form), files cannot be attached yet. */
  readonly projectId = input<string>();
  readonly value = input.required<string>();
  readonly valueChange = output<string>();
  readonly attachmentAdded = output<Attachment>();

  constructor() {
    afterNextRender(() => {
      [this.editor] = new OverType(this.host().nativeElement, {
        value: this.value(),
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
          button('h1', 'Titre 1'),
          button('h2', 'Titre 2'),
          button('h3', 'Titre 3'),
          toolbarButtons.separator,
          button('bold', 'Gras (Ctrl+B)'),
          button('italic', 'Italique (Ctrl+I)'),
          button('code', 'Code'),
          toolbarButtons.separator,
          button('link', 'Lien'),
          button('bulletList', 'Liste à puces'),
          button('orderedList', 'Liste numérotée'),
          button('taskList', 'Liste de cases à cocher'),
          button('quote', 'Citation'),
          ...(this.projectId() ? [toolbarButtons.separator, button('upload', 'Joindre une image ou un fichier')] : []),
        ],
        textareaProps: { 'aria-label': 'Pitch en markdown' },
        fileUpload: {
          enabled: !!this.projectId(),
          maxSize: MAX_ATTACHMENT_SIZE,
          onInsertFile: (f) => this.upload(f),
        },
        onChange: (v) => this.valueChange.emit(v),
      });
    });
  }

  private async upload(f: File | File[]): Promise<string | string[]> {
    const files = Array.isArray(f) ? f : [f];
    const links = await Promise.all(
      files.map(async (file) => {
        try {
          const attachment = await this.api.uploadAttachment(this.projectId()!, file);
          this.attachmentAdded.emit(attachment);
          return markdownLink(attachment);
        } catch (e) {
          this.toast.error(`${file.name} : ${errorMessage(e)}`);
          return '';
        }
      }),
    );
    return Array.isArray(f) ? links : links[0];
  }

  /** Replaces the text (e.g. template title updated with the project name). */
  replace(value: string) {
    if (this.editor && this.editor.getValue() !== value) this.editor.setValue(value);
  }

  ngOnDestroy() {
    this.editor?.destroy();
  }
}

/** Toolbar button, with its French label. */
function button(name: Exclude<keyof typeof toolbarButtons, 'separator'>, title: string) {
  return { ...toolbarButtons[name], title };
}

/** Images shown in the pitch; the API serves other files as downloads. */
const IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Markdown link to an attachment: a displayed image, or a link to the file. */
export function markdownLink(a: Pick<Attachment, 'filename' | 'contentType' | 'url'>): string {
  const text = a.filename.replace(/[[\]]/g, '');
  return IMAGES.includes(a.contentType) ? `![${text}](${a.url})` : `[${text}](${a.url})`;
}

/** Removes from a markdown text the links and images to a URL (same rule as the API). */
export function removeLink(markdown: string, url: string): string {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown
    .replace(new RegExp(`^[ \\t]*!?\\[[^\\]\\n]*\\]\\(${escaped}\\)[ \\t]*\\n?`, 'gm'), '')
    .replace(new RegExp(`!?\\[[^\\]\\n]*\\]\\(${escaped}\\)`, 'g'), '');
}
