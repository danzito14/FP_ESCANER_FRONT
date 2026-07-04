import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../core/constants/api';

/** Una foto de empleado pendiente de volver a tomar (de SYS21). Campos laxos por si el back varía. */
export interface FotoPendiente {
  id_pendiente: number | string;
  id_emp?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  motivo?: string | null;
  [k: string]: unknown;
}

/** Resumen de POR QUÉ fallan las fotos pendientes (agrupado). */
export interface ResumenPendiente {
  origen?: string | null;
  motivo?: string | null;
  total: number;
  [k: string]: unknown;
}

/**
 * Sincronizador de empleados con SYS21 (solo admin). El backend lo corre automático;
 * estos endpoints son para dispararlo/consultarlo MANUALMENTE desde el panel.
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

  /** Empleados cuya foto hay que volver a tomar. */
  fotosPendientes(): Observable<FotoPendiente[]> {
    return this.http.get<FotoPendiente[]>(`${API_URL}/emp_sync/fotos-pendientes`);
  }

  /** Resumen de por qué fallan (agrupado por origen/motivo). */
  resumenPendientes(): Observable<ResumenPendiente[]> {
    return this.http.get<ResumenPendiente[]>(`${API_URL}/emp_sync/fotos-pendientes/resumen`);
  }

  /** Empleados con área inválida (no mapea a un área del sistema). */
  areasInvalidas(): Observable<FotoPendiente[]> {
    return this.http.get<FotoPendiente[]>(`${API_URL}/emp_sync/fotos-pendientes/areas-invalidas`);
  }

  /** Marca una foto pendiente como resuelta o ignorada. */
  resolver(idPendiente: number | string, estado: 'resuelta' | 'ignorada'): Observable<unknown> {
    return this.http.patch(`${API_URL}/emp_sync/fotos-pendientes/${idPendiente}`, { estado });
  }
}
