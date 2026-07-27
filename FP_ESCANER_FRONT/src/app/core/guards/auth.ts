import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../../service/auth';
import { PlatformService } from '../../service/platform';

/** Protege rutas: redirige a /login si no hay sesión activa. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login']);
};

/**
 * Protege una ruta exigiendo un scope (ej. 'usuarios:read', 'scanner:use').
 * Sin sesión → /login; con sesión pero sin permiso → inicio.
 */
export function scopeGuard(scope: string): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
    if (auth.tieneScope(scope)) return true;
    return router.createUrlTree(['/']);
  };
}

/** Solo invitados: si ya hay sesión, manda al inicio (evita volver al login). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};

/**
 * Ruta de inicio ('/'): si el usuario es kiosko puro (scanner:use sin acceso al panel),
 * lo manda al escáner que corresponde a SU entorno (APK → /descarga, escritorio →
 * /kiosko-pc, web → /scanner); el resto ve el landing normal. Cubre el relanzamiento
 * del kiosko — su token no expira, así que no repasa por el login.
 * (Los scopes se leen de localStorage al construir AuthService, así que es fiable síncrono.)
 */
export const kioskoInicioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const plataforma = inject(PlatformService);
  const router = inject(Router);

  if (plataforma.isServer) return true; // en SSR no hay sesión que redirigir
  if (auth.puedeUsarScanner() && !auth.puedeVerDashboard()) {
    return router.createUrlTree([plataforma.rutaKiosko]);
  }
  return true;
};

/**
 * Rutas del kiosko OFFLINE (/descarga, /escaneo, /enrolar): solo tienen sentido en el
 * APK, que es donde vive el plugin nativo FaceEngine. En web/Electron desvía al escáner
 * del entorno en vez de dejar al usuario atrapado en una descarga que no puede correr.
 */
export const soloNativoGuard: CanActivateFn = () => {
  const plataforma = inject(PlatformService);
  const router = inject(Router);

  if (plataforma.isNative || plataforma.isServer) return true; // SSR: no redirige (igual que antes)
  return router.createUrlTree([plataforma.rutaKiosko]);
};
