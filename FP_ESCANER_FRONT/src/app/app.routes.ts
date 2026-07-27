import { Routes } from '@angular/router';

import {
  authGuard,
  guestGuard,
  kioskoInicioGuard,
  scopeGuard,
  soloNativoGuard,
} from './core/guards/auth';
import { rosterListoGuard } from './core/roster-listo.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [kioskoInicioGuard],
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
  // ── Kiosko de escritorio (Electron/PC) — reconoce vía backend local :8100 ──
  {
    path: 'kiosko-pc',
    canActivate: [scopeGuard('scanner:use')],
    loadComponent: () =>
      import('./pages/kiosko-pc/kiosko-pc').then((m) => m.KioskoPcComponent),
  },
  // ── Kiosko offline (APK) — solo nativo + scanner:use + roster/modelo listos ──
  {
    path: 'descarga',
    canActivate: [scopeGuard('scanner:use'), soloNativoGuard],
    loadComponent: () =>
      import('./pages/descarga/descarga.component').then((m) => m.DescargaComponent),
  },
  {
    path: 'escaneo',
    canActivate: [scopeGuard('scanner:use'), soloNativoGuard, rosterListoGuard],
    loadComponent: () =>
      import('./pages/escaneo/escaneo.component').then((m) => m.EscaneoComponent),
  },
  {
    path: 'enrolar',
    canActivate: [scopeGuard('scanner:use'), soloNativoGuard, rosterListoGuard],
    loadComponent: () =>
      import('./pages/enrolamiento/enrolamiento.component').then(
        (m) => m.EnrolamientoComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
