import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import {
  PuertaAcceso,
  PuertaAccesoCreate,
  PuertaAccesoUpdate,
} from '../core/interfaces/puerta-acceso';

@Injectable({ providedIn: 'root' })
export class PuertaAccesoService extends BaseCrud<
  PuertaAcceso,
  PuertaAccesoCreate,
  PuertaAccesoUpdate
> {
  // OJO: la doc indica prefijo '/puertas'. Ajusta si tu API usa otro (p. ej. 'puertas_acceso').
  protected readonly resource = 'puertas';
}
