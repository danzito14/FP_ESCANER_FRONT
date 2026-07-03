import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { IntentoAcceso, IntentoUpdate } from '../core/interfaces/intento-acceso';

/**
 * GET /intentos (con `estado` real) y PUT /intentos/{id_intento} para justificar.
 * Para 'otra_empresa', justificar crea una asistencia manual y marca justificada
 * la incidencia acceso_otra_empresa ligada (lo hace el backend); spoofing/desconocido
 * solo cambian de estado. Auth + scope por empresa (la ruta usa incidencias:read).
 */
@Injectable({ providedIn: 'root' })
export class IntentoService extends BaseCrud<IntentoAcceso, never, IntentoUpdate> {
  protected readonly resource = 'intentos';
}
