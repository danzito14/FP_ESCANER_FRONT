import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BaseCrud } from './base-crud';
import { Asistencia, AsistenciaManualCreate } from '../core/interfaces/asistencia';
import { ResumenDia } from '../core/interfaces/resumen';

@Injectable({ providedIn: 'root' })
export class AsistenciaService extends BaseCrud<Asistencia> {
  protected readonly resource = 'asistencias';

  /**
   * POST /asistencias — alta manual (ej. resolver un "rostro desconocido").
   * Devuelve la asistencia con nombres resueltos. id_trabajador/id_puerta van
   * requeridos; la empresa la deriva el backend del trabajador.
   */
  crearManual(body: AsistenciaManualCreate): Observable<Asistencia> {
    return this.http.post<Asistencia>(this.baseUrl, body);
  }

  /**
   * GET /asistencias/resumen-dia — contadores presentes/esperados por categoría
   * para una fecha (default hoy en el backend). `idEmpresa` solo lo aplica el
   * back para super-admin; a los demás los limita por el token.
   */
  resumenDia(opts: { fecha?: string; idEmpresa?: number } = {}): Observable<ResumenDia> {
    let params = new HttpParams();
    if (opts.fecha) params = params.set('fecha', opts.fecha);
    if (opts.idEmpresa) params = params.set('id_empresa', opts.idEmpresa);
    return this.http.get<ResumenDia>(`${this.baseUrl}/resumen-dia`, { params });
  }
}
