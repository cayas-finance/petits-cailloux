import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** Affiche un pitch markdown en HTML, nettoyé par DOMPurify. */
@Component({
  selector: 'app-pitch-rendu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="pitch-rendu" [innerHTML]="html()"></div>`,
})
export class PitchRenduComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly markdown = input.required<string>();

  protected readonly html = computed(() => {
    const brut = marked.parse(this.markdown(), { async: false, gfm: true, breaks: true });
    const propre = DOMPurify.sanitize(brut, { ADD_ATTR: ['target'] });
    // Contenu déjà nettoyé par DOMPurify : Angular n'a pas à le re-filtrer.
    return this.sanitizer.bypassSecurityTrustHtml(propre);
  });
}
