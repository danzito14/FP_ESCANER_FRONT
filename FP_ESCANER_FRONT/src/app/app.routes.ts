import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing-page/landing-page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'usuarios',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/usuarios-page/usuarios-page').then((m) => m.UsuariosPage),
  },
  {
    path: 'trabajadores',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/trabajadores-page/trabajadores-page').then(
        (m) => m.TrabajadoresPage,
      ),
  },
  {
    path: 'empresas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/empresas-page/empresas-page').then((m) => m.EmpresasPage),
  },
  {
    path: 'areas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/areas-page/areas-page').then((m) => m.AreasPage),
  },
  {
    path: 'dispositivos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dispositivos-page/dispositivos-page').then(
        (m) => m.DispositivosPage,
      ),
  },
  {
    path: 'puertas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/puertas-page/puertas-page').then((m) => m.PuertasPage),
  },
  {
    path: 'asistencias',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/asistencias-page/asistencias-page').then(
        (m) => m.AsistenciasPage,
      ),
  },
  {
    path: 'incidencias',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/incidencias-page/incidencias-page').then(
        (m) => m.IncidenciasPage,
      ),
  },
  { path: '**', redirectTo: '' },
];
