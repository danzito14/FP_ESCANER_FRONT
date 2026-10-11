import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

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

/** Archivo descargado + nombre con el que se guarda. */
export interface ArchivoReporte {
  blob: Blob;
  nombre: string;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** `attachment; filename="Reporte_x.xlsx"` → `Reporte_x.xlsx` (null si no viene). */
function nombreDeDisposition(header: string | null): string | null {
  const m = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return m ? decodeURIComponent(m[1]) : null;
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
  ): Observable<ArchivoReporte> {
    let params = new HttpParams().set('formato', formato);
    if (opts.fechaInicio) params = params.set('fecha_inicio', opts.fechaInicio);
    if (opts.fechaFin) params = params.set('fecha_fin', opts.fechaFin);
    if (opts.idTrabajador) params = params.set('id_trabajador', opts.idTrabajador);
    const tipoFiltro = opts.tipoIncidencia || opts.tipoRegistro;
    if (tipoFiltro) params = params.set('tipo', tipoFiltro);
    if (opts.rostro) params = params.set('rostro', opts.rostro);
    if (opts.idEmpresa) params = params.set('id_empresa', opts.idEmpresa);
    return this.http
      .get(`${API_URL}/reportes/${tipo}`, { params, responseType: 'blob', observe: 'response' })
      .pipe(
        map((res) => ({
          blob: res.body ?? new Blob(),
          nombre:
            nombreDeDisposition(res.headers.get('Content-Disposition')) ??
            this.nombreRespaldo(tipo, formato, opts),
        })),
      );
  }

  /**
   * Respaldo si el header no llega: Reporte_<tipo>_<fecha>.<ext>. El nombre completo
   * (con la empresa) lo arma el back: Reporte_asistencia_SL_Agricola_07Oct2026.xlsx.
   */
  private nombreRespaldo(tipo: TipoReporte, formato: FormatoReporte, opts: OpcionesReporte): string {
    const tipoArchivo =
      (tipo === 'asistencias' && opts.tipoRegistro) ||
      (tipo === 'incidencias' && opts.tipoIncidencia) ||
      tipo.replace(/s$/, '');
    const hoy = new Date();
    const fecha = `${String(hoy.getDate()).padStart(2, '0')}${MESES[hoy.getMonth()]}${hoy.getFullYear()}`;
    return `Reporte_${tipoArchivo}_${fecha}.${formato}`;
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
