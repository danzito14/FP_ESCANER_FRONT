import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DbService } from './db.service';
import { ModeloService } from './modelo.service';

/** Bloquea el escáner si falta el roster O el modelo de reconocimiento cargado en el
 *  plugin nativo → manda a /descarga. Sin lo 2º, en cold-start el `runner` nativo es null
 *  y extractEmbedding rechaza siempre (el escáner "no reconoce a nadie"). */
export const rosterListoGuard: CanActivateFn = async (_route, state) => {
  const db = inject(DbService);
  const modelo = inject(ModeloService);
  const router = inject(Router);
  await db.init();
  const hayRoster = (await db.contarTrabajadores()) > 0;
  const modeloListo = hayRoster && await modelo.cargarDeDisco();  // carga de disco (NO descarga)
  // Si falta preparar, va a /descarga y VUELVE a la ruta intentada (no siempre /escaneo).
  return modeloListo
    ? true
    : router.createUrlTree(['/descarga'], { queryParams: { next: state.url } });
};
