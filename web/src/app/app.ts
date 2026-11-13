import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ZardSonnerComponent } from '@/shared/components/sonner';
import { Api } from './core/api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ZardSonnerComponent],
  template: `
    <header class="border-b bg-background">
      <div class="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-3 px-4 pt-5 pb-0">
        <div>
          <p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Cayas · méthode Petit Poucet</p>
          <a routerLink="/" class="text-2xl font-bold">Petits cailloux</a>
        </div>
        @if (email()) {
          <p class="text-sm text-muted-foreground">{{ email() }}</p>
        }
        <nav class="-mb-px flex w-full gap-1 overflow-x-auto" aria-label="Navigation principale">
          <a
            routerLink="/trimestres"
            routerLinkActive="border-primary text-foreground"
            class="border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground"
            >Trimestres et cycles</a
          >
          <span class="cursor-not-allowed px-3 py-2 text-sm whitespace-nowrap text-muted-foreground/60" title="Bientôt">Projets</span>
          <span class="cursor-not-allowed px-3 py-2 text-sm whitespace-nowrap text-muted-foreground/60" title="Bientôt">Suivi</span>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6">
      <router-outlet />
    </main>
    <z-sonner position="bottom-center" />
  `,
})
export class App {
  private readonly api = inject(Api);
  protected readonly email = signal('');

  constructor() {
    this.api.moi().then((m) => this.email.set(m.email)).catch(() => {});
  }
}
