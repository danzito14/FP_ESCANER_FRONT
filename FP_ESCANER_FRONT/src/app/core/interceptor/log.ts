import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

import { LogService } from '../log.service';

/** Deja solo la ruta (quita el origen) para que quepa en el panel. */
function corta(url: string): string {
  const i = url.indexOf('/', url.indexOf('://') + 3);
  return i >= 0 ? url.slice(i) : url;
}

/** Registra cada petición de HttpClient en el LogService: método, ruta, status y ms. */
export const logInterceptor: HttpInterceptorFn = (req, next) => {
  const log = inject(LogService);
  const t0 = Date.now();
  log.net(`→ ${req.method} ${corta(req.urlWithParams)}`);
  return next(req).pipe(
    tap({
      next: (e) => {
        if (e instanceof HttpResponse) {
          log.ok(`← ${e.status} ${corta(req.url)} (${Date.now() - t0}ms)`);
        }
      },
      error: (e) =>
        log.error(`✕ ${e?.status ?? 'ERR'} ${corta(req.url)} — ${e?.statusText ?? e?.message ?? ''}`),
    }),
  );
};
