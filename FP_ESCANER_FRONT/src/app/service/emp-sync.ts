import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../core/constants/api';

/** Estado de una foto pendiente (revisión manual). */
export type EstadoFoto = 'pendiente' | 'resuelto' | 'ignorado';

/** Una fila de foto pendiente (GET /emp_sync/fotos-pendientes → FotoPendienteResponse). */
export interface FotoPendiente {
  id_pendiente: number;
  id_emp: string;
  origen_nomina: string;
  id_trabajador?: number | null;
  id_empresa?: number | null;
  /** Nombre ya resuelto por el back (LEFT JOIN); null en area_invalida (sin trabajador). */
  trabajador_nombre?: string | null;
  motivo: string;
  detalle?: string | null;
  fecha: string;
  estado: EstadoFoto | string;
}

/** Fila del resumen (agrupado por origen+motivo). */
export interface ResumenPendiente {
  origen_nomina: string;
  motivo: string;
  total: number;
}

/** Catálogo de motivos con etiqueta legible (para leyenda y filtros). */
export interface MotivoCatalogo {
  motivo: string;
  label: string;
}

/** Desglose de 'area_invalida' por detalle (qué áreas etiquetar). Solo super-admin. */
export interface AreaInvalida {
  origen_nomina: string;
  detalle: string | null;
  total: number;
}

/** Filtros de la tabla de fotos pendientes. `estado: ''` = todas. */
export interface FiltroFotos {
  estado?: string;
  origen?: string;
  motivo?: string;
  skip?: number;
  limit?: number;
}

/**
 * Sincronizador de empleados con SYS21 (solo admin). El backend lo corre automático;
 * estos endpoints son para dispararlo/consultarlo MANUALMENTE desde el panel.
 * Prefijo /emp_sync (scope emp_sync:read; el PATCH exige emp_sync:write).
 */
@Injectable({ providedIn: 'root' })
export class EmpSyncService {
  private readonly http = inject(HttpClient);

  /** Dispara la sincronización completa con SYS21 (corre en segundo plano). */
  run(): Observable<unknown> {
    return this.http.post(`${API_URL}/emp_sync/run`, {});
  }

  /** Procesa SOLO las fotos de los trabajadores ya registrados. */
  fotos(): Observable<unknown> {
    return this.http.post(`${API_URL}/emp_sync/fotos`, {});
  }

  /** Estado de sincronización por empleado. */
  estado(): Observable<unknown> {
    return this.http.get(`${API_URL}/emp_sync/estado`);
  }

  /**
   * Tabla principal de fotos pendientes. Filtros: estado (default 'pendiente';
   * '' = todas), origen, motivo, skip, limit. Las filas ya traen trabajador_nombre.
   */
  fotosPendientes(f: FiltroFotos = {}): Observable<FotoPendiente[]> {
    let params = new HttpParams();
    if (f.estado !== undefined) params = params.set('estado', f.estado);
    if (f.origen) params = params.set('origen', f.origen);
    if (f.motivo) params = params.set('motivo', f.motivo);
    if (f.skip !== undefined) params = params.set('skip', f.skip);
    if (f.limit !== undefined) params = params.set('limit', f.limit);
    return this.http.get<FotoPendiente[]>(`${API_URL}/emp_sync/fotos-pendientes`, { params });
  }

  /** Resumen (conteo) agrupado por origen+motivo. `estado` default 'pendiente'; '' = todas. */
  resumenPendientes(estado?: string): Observable<ResumenPendiente[]> {
    let params = new HttpParams();
    if (estado !== undefined) params = params.set('estado', estado);
    return this.http.get<ResumenPendiente[]>(`${API_URL}/emp_sync/fotos-pendientes/resumen`, { params });
  }

  /** Catálogo de los 17 motivos con etiqueta legible (leyenda + filtros). */
  motivos(): Observable<MotivoCatalogo[]> {
    return this.http.get<MotivoCatalogo[]>(`${API_URL}/emp_sync/fotos-pendientes/motivos`);
  }

  /** Desglose de 'area_invalida' por detalle (qué áreas etiquetar). Solo super-admin. */
  areasInvalidas(limite?: number): Observable<AreaInvalida[]> {
    let params = new HttpParams();
    if (limite !== undefined) params = params.set('limite', limite);
    return this.http.get<AreaInvalida[]>(`${API_URL}/emp_sync/fotos-pendientes/areas-invalidas`, { params });
  }

  /** Marca una foto pendiente como resuelta/ignorada (o la reabre a 'pendiente'). */
  resolver(idPendiente: number, estado: EstadoFoto): Observable<FotoPendiente> {
    return this.http.patch<FotoPendiente>(
      `${API_URL}/emp_sync/fotos-pendientes/${idPendiente}`,
      { estado },
    );
  }
}
