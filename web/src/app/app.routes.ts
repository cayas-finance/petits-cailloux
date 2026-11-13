import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'trimestres' },
  {
    path: 'trimestres',
    title: 'Trimestres · Petits cailloux',
    loadComponent: () => import('./pages/trimestres.page').then((m) => m.TrimestresPage),
  },
  {
    path: 'trimestres/:id',
    title: 'Trimestre · Petits cailloux',
    loadComponent: () => import('./pages/trimestre.page').then((m) => m.TrimestrePage),
  },
  { path: '**', redirectTo: 'trimestres' },
];
