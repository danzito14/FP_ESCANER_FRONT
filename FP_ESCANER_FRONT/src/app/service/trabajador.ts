import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BaseCrud } from './base-crud';
import {
  LimpiarDuplicadosResponse,
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate,
} from '../core/interfaces/trabajador';

@Injectable({ providedIn: 'root' })
export class TrabajadorService extends BaseCrud<
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate
> {
  protected readonly resource = 'trabajadores';
  // Búsqueda por nº de empleado SYS21 (id_emp), no por id_trabajador.
  protected override readonly idParam = 'id_emp';

  /**
   * POST /trabajadores/limpiar-duplicados?simular= — SOLO super-admin.
   * `simular=true` (default) = dry-run: reporta qué se limpiaría sin borrar.
   * `simular=false` = ejecuta el borrado. El `/api` de apiUrl lo recorta el gateway.
   */
  limpiarDuplicados(simular = true): Observable<LimpiarDuplicadosResponse> {
    const params = new HttpParams().set('simular', simular);
    return this.http.post<LimpiarDuplicadosResponse>(
      `${this.baseUrl}/limpiar-duplicados`,
      {},
      { params },
    );
  }
}
