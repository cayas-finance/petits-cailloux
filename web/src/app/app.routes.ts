import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'roadmap' },
  {
    path: 'roadmap',
    title: 'Roadmap · Petits cailloux',
    loadComponent: () => import('./pages/roadmap.page').then((m) => m.RoadmapPage),
  },
  {
    path: 'quarters',
    title: 'Trimestres · Petits cailloux',
    loadComponent: () => import('./pages/quarters.page').then((m) => m.QuartersPage),
  },
  {
    path: 'quarters/:id',
    title: 'Trimestre · Petits cailloux',
    loadComponent: () => import('./pages/quarter.page').then((m) => m.QuarterPage),
  },
  {
    path: 'projects',
    title: 'Projets · Petits cailloux',
    loadComponent: () => import('./pages/projects.page').then((m) => m.ProjectsPage),
  },
  {
    path: 'projects/new',
    title: 'Nouveau projet · Petits cailloux',
    loadComponent: () => import('./pages/project.page').then((m) => m.ProjectPage),
  },
  {
    path: 'projects/:id/pitch',
    title: 'Pitch · Petits cailloux',
    loadComponent: () => import('./pages/pitch.page').then((m) => m.PitchPage),
  },
  {
    path: 'projects/:id',
    title: 'Projet · Petits cailloux',
    loadComponent: () => import('./pages/project.page').then((m) => m.ProjectPage),
  },
  {
    path: 'weekly-review',
    title: 'Point hebdo · Petits cailloux',
    loadComponent: () => import('./pages/weekly-review.page').then((m) => m.WeeklyReviewPage),
  },
  { path: '**', redirectTo: 'roadmap' },
];
