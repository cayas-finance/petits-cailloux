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
  {
    path: 'projets',
    title: 'Projets · Petits cailloux',
    loadComponent: () => import('./pages/projets.page').then((m) => m.ProjetsPage),
  },
  {
    path: 'projets/nouveau',
    title: 'Nouveau projet · Petits cailloux',
    loadComponent: () => import('./pages/projet.page').then((m) => m.ProjetPage),
  },
  {
    path: 'projets/:id/pitch',
    title: 'Pitch · Petits cailloux',
    loadComponent: () => import('./pages/pitch.page').then((m) => m.PitchPage),
  },
  {
    path: 'projets/:id',
    title: 'Projet · Petits cailloux',
    loadComponent: () => import('./pages/projet.page').then((m) => m.ProjetPage),
  },
  { path: '**', redirectTo: 'trimestres' },
];
