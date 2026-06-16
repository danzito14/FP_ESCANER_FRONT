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
