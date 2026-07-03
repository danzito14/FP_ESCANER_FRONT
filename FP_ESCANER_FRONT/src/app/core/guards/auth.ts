import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../../service/auth';

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
 * lo manda a su flujo offline (/descarga); el resto ve el landing normal. Cubre el
 * relanzamiento del APK — el token de kiosko no expira, así que no repasa por el login.
 * (Los scopes se leen de localStorage al construir AuthService, así que es fiable síncrono.)
 */
export const kioskoInicioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.puedeUsarScanner() && !auth.puedeVerDashboard()) {
    return router.createUrlTree(['/descarga']);
  }
  return true;
};
