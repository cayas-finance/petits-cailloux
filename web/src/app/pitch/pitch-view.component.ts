import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** Renders a markdown pitch as HTML, sanitized by DOMPurify. */
@Component({
  selector: 'app-pitch-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="pitch-content" [innerHTML]="html()"></div>`,
})
export class PitchViewComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly markdown = input.required<string>();

  protected readonly html = computed(() => {
    const raw = marked.parse(this.markdown(), { async: false, gfm: true, breaks: true });
    const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
    // Already sanitized by DOMPurify: Angular does not need to filter it again.
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  });
}
