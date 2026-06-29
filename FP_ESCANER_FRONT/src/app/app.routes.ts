import { Routes } from '@angular/router';

import { authGuard, guestGuard, scopeGuard } from './core/guards/auth';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing-page/landing-page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'usuarios',
    canActivate: [scopeGuard('usuarios:read')],
    loadComponent: () =>
      import('./pages/usuarios-page/usuarios-page').then((m) => m.UsuariosPage),
  },
  {
    path: 'roles',
    canActivate: [scopeGuard('roles:read')],
    loadComponent: () =>
      import('./pages/roles-page/roles-page').then((m) => m.RolesPage),
  },
  {
    path: 'trabajadores',
    canActivate: [scopeGuard('trabajadores:read')],
    loadComponent: () =>
      import('./pages/trabajadores-page/trabajadores-page').then(
        (m) => m.TrabajadoresPage,
      ),
  },
  {
    path: 'empresas',
    canActivate: [scopeGuard('empresas:read')],
    loadComponent: () =>
      import('./pages/empresas-page/empresas-page').then((m) => m.EmpresasPage),
  },
  {
    path: 'areas',
    canActivate: [scopeGuard('areas:read')],
    loadComponent: () =>
      import('./pages/areas-page/areas-page').then((m) => m.AreasPage),
  },
  {
    path: 'dispositivos',
    canActivate: [scopeGuard('dispositivos:read')],
    loadComponent: () =>
      import('./pages/dispositivos-page/dispositivos-page').then(
        (m) => m.DispositivosPage,
      ),
  },
  {
    path: 'puertas',
    canActivate: [scopeGuard('puertas:read')],
    loadComponent: () =>
      import('./pages/puertas-page/puertas-page').then((m) => m.PuertasPage),
  },
  {
    path: 'asistencias',
    canActivate: [scopeGuard('asistencias:read')],
    loadComponent: () =>
      import('./pages/asistencias-page/asistencias-page').then(
        (m) => m.AsistenciasPage,
      ),
  },
  {
    path: 'incidencias',
    canActivate: [scopeGuard('incidencias:read')],
    loadComponent: () =>
      import('./pages/incidencias-page/incidencias-page').then(
        (m) => m.IncidenciasPage,
      ),
  },
  {
    path: 'intentos',
    canActivate: [scopeGuard('incidencias:read')],
    loadComponent: () =>
      import('./pages/intentos-page/intentos-page').then((m) => m.IntentosPage),
  },
  {
    path: 'scanner',
    canActivate: [scopeGuard('scanner:use')],
    loadComponent: () =>
      import('./pages/scanner-page/scanner-page').then((m) => m.ScannerPage),
  },
  {
    path: 'reportes',
    canActivate: [scopeGuard('reportes:read')],
    loadComponent: () =>
      import('./pages/reportes-page/reportes-page').then((m) => m.ReportesPage),
  },
  {
    path: 'configuracion',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/configuracion-page/configuracion-page').then(
        (m) => m.ConfiguracionPage,
      ),
  },
  { path: '**', redirectTo: '' },
];
