import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BaseCrud } from './base-crud';
import { Incidencia, IncidenciaUpdate } from '../core/interfaces/incidencia';
import { EventoCombinado, OrigenEvento } from '../core/interfaces/evento-combinado';
import { RetardoResponse } from '../core/interfaces/retardo';

@Injectable({ providedIn: 'root' })
export class IncidenciaService extends BaseCrud<Incidencia, never, IncidenciaUpdate> {
  protected readonly resource = 'incidencias';

  /**
   * GET /incidencias/combinado — lista unificada de incidencias + intentos,
   * ordenada por fecha/hora desc y scopeada por empresa en el backend.
   */
  combinado(
    opts: {
      fechaInicio?: string;
      fechaFin?: string;
      tipo?: string;
      origen?: OrigenEvento;
      skip?: number;
      limit?: number;
    } = {},
  ): Observable<EventoCombinado[]> {
    let params = new HttpParams()
      .set('skip', opts.skip ?? 0)
      .set('limit', opts.limit ?? 500);
    if (opts.fechaInicio) params = params.set('fecha_inicio', opts.fechaInicio);
    if (opts.fechaFin) params = params.set('fecha_fin', opts.fechaFin);
    if (opts.tipo) params = params.set('tipo', opts.tipo);
    if (opts.origen) params = params.set('origen', opts.origen);
    return this.http.get<EventoCombinado[]>(`${this.baseUrl}/combinado`, { params });
  }

  /**
   * GET /incidencias/retardos — retardos calculados al vuelo (no viven en el
   * combinado). `toleranciaMin` = minutos de gracia (default 0).
   */
  retardos(
    opts: {
      fechaInicio?: string;
      fechaFin?: string;
      idTrabajador?: number;
      toleranciaMin?: number;
      skip?: number;
      limit?: number;
    } = {},
  ): Observable<RetardoResponse[]> {
    let params = new HttpParams()
      .set('skip', opts.skip ?? 0)
      .set('limit', opts.limit ?? 100);
    if (opts.fechaInicio) params = params.set('fecha_inicio', opts.fechaInicio);
    if (opts.fechaFin) params = params.set('fecha_fin', opts.fechaFin);
    if (opts.idTrabajador) params = params.set('id_trabajador', opts.idTrabajador);
    if (opts.toleranciaMin != null) params = params.set('tolerancia_min', opts.toleranciaMin);
    return this.http.get<RetardoResponse[]>(`${this.baseUrl}/retardos`, { params });
  }
}
