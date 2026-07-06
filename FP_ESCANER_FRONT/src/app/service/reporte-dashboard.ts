import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../core/constants/api';

/** Conteo total/presentes por tipo de fichaje (oficina/empaque/campo). */
export interface DashboardPorTipo {
  total: number;
  presentes: number;
}

/** Resumen del día (GET /reportes/dashboard). */
export interface DashboardDia {
  fecha: string;
  empresa: number;
  trabajadores: { total: number; con_rostro: number; sin_rostro: number };
  asistencia: {
    presentes: number;
    ausentes: number;
    por_tipo: Record<string, DashboardPorTipo>;
  };
  retardos_hoy: number;
  intentos_hoy: number;
  incidencias_pendientes: number;
}

@Injectable({ providedIn: 'root' })
export class ReporteDashboardService {
  private readonly http = inject(HttpClient);

  /**
   * Resumen del día.
   * @param idEmpresa 0 = todas las empresas (solo admin); N = esa empresa. Si se
   *   omite, el backend cae en la empresa 1 para el admin. Para un usuario normal
   *   el parámetro no importa (el backend siempre lo acota a la suya).
   * @param fecha 'YYYY-MM-DD' (vacío = hoy).
   */
  dia(idEmpresa?: number, fecha?: string): Observable<DashboardDia> {
    let params = new HttpParams();
    if (idEmpresa !== undefined) params = params.set('id_empresa', idEmpresa);
    if (fecha) params = params.set('fecha', fecha);
    return this.http.get<DashboardDia>(`${API_URL}/reportes/dashboard`, { params });
  }
}
