import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../core/constants/api';

export type TipoReporte =
  | 'asistencias'
  | 'incidencias'
  | 'intentos'
  | 'trabajadores'
  | 'retardos';
export type FormatoReporte = 'xlsx' | 'csv';
/** Filtro de /reportes/asistencias ('' = entradas y salidas). */
export type TipoRegistroReporte = '' | 'entrada' | 'salida';
/** Filtro de /reportes/trabajadores ('' = todo el padrón). */
export type RostroReporte = '' | 'con' | 'sin';

export interface OpcionesReporte {
  fechaInicio?: string;
  fechaFin?: string;
  idTrabajador?: number;
  /** Solo incidencias: tipo de incidencia (va como `tipo`). */
  tipoIncidencia?: string;
  /** Solo asistencias: entrada/salida (va como `tipo`). */
  tipoRegistro?: TipoRegistroReporte;
  /** Solo trabajadores: con/sin rostro registrado. */
  rostro?: RostroReporte;
  /** Solo lo aplica el back para super-admin; a los demás los limita el token. */
  idEmpresa?: number;
}

/** Descarga de reportes (Excel/CSV). El backend acota por empresa del usuario. */
@Injectable({ providedIn: 'root' })
export class ReporteService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * GET /reportes/{tipo}?formato=&fecha_inicio=&fecha_fin=&id_trabajador=&tipo=&rostro=&id_empresa=
   * → archivo (blob).
   */
  descargar(
    tipo: TipoReporte,
    formato: FormatoReporte,
    opts: OpcionesReporte = {},
  ): Observable<Blob> {
    let params = new HttpParams().set('formato', formato);
    if (opts.fechaInicio) params = params.set('fecha_inicio', opts.fechaInicio);
    if (opts.fechaFin) params = params.set('fecha_fin', opts.fechaFin);
    if (opts.idTrabajador) params = params.set('id_trabajador', opts.idTrabajador);
    const tipoFiltro = opts.tipoIncidencia || opts.tipoRegistro;
    if (tipoFiltro) params = params.set('tipo', tipoFiltro);
    if (opts.rostro) params = params.set('rostro', opts.rostro);
    if (opts.idEmpresa) params = params.set('id_empresa', opts.idEmpresa);
    return this.http.get(`${API_URL}/reportes/${tipo}`, { params, responseType: 'blob' });
  }

  /** Nombre del archivo como lo nombra el back según el filtro (entradas.xlsx, salidas.csv…). */
  nombreArchivo(tipo: TipoReporte, formato: FormatoReporte, opts: OpcionesReporte = {}): string {
    let base: string = tipo;
    if (tipo === 'asistencias' && opts.tipoRegistro) base = `${opts.tipoRegistro}s`;
    return `${base}.${formato}`;
  }

  /** Dispara la descarga del blob en el navegador. */
  guardar(blob: Blob, nombre: string): void {
    if (!this.isBrowser) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }
}
