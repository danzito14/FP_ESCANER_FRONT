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

/** Descarga de reportes (Excel/CSV). El backend acota por empresa del usuario. */
@Injectable({ providedIn: 'root' })
export class ReporteService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** GET /reportes/{tipo}?formato=&fecha_inicio=&fecha_fin=&id_trabajador=&tipo= → archivo (blob). */
  descargar(
    tipo: TipoReporte,
    formato: FormatoReporte,
    opts: {
      fechaInicio?: string;
      fechaFin?: string;
      idTrabajador?: number;
      tipoIncidencia?: string;
    } = {},
  ): Observable<Blob> {
    let params = new HttpParams().set('formato', formato);
    if (opts.fechaInicio) params = params.set('fecha_inicio', opts.fechaInicio);
    if (opts.fechaFin) params = params.set('fecha_fin', opts.fechaFin);
    if (opts.idTrabajador) params = params.set('id_trabajador', opts.idTrabajador);
    if (opts.tipoIncidencia) params = params.set('tipo', opts.tipoIncidencia);
    return this.http.get(`${API_URL}/reportes/${tipo}`, { params, responseType: 'blob' });
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
