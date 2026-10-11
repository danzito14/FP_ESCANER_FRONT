import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../core/constants/api';

export type OrigenNomina = 'agricola' | 'agricola_com';
export type GrupoArea = 'oficina' | 'empaque' | 'campo';

/** Regla del clasificador del sync SYS21 (GET /emp_sync/reglas → ReglaResponse). */
export interface ReglaClasificacion {
  id_regla: number;
  origen_nomina: OrigenNomina;
  /** Puesto/departamento normalizado (con lo que empata la nómina). */
  clave: string;
  /** Como se capturó (para mostrar). */
  nombre: string;
  grupo: GrupoArea;
  /** Reemplazos opcionales; null = default del grupo. */
  permiso_escaneo: string | null;
  nivel_acceso_interno: string | null;
  /** Lo que recibe el trabajador al final (override o default del grupo). */
  permiso_efectivo: string;
  nivel_efectivo: string | null;
  actualizado_por: string | null;
  fecha_actualizacion: string | null;
}

export interface ReglaCreate {
  origen_nomina: OrigenNomina;
  nombre: string;
  grupo: GrupoArea;
  permiso_escaneo?: string | null;
  nivel_acceso_interno?: string | null;
}

/** Cambio parcial: un campo en null regresa al default del grupo. */
export type ReglaUpdate = Partial<Omit<ReglaCreate, 'origen_nomina'>>;

/** Puesto/departamento que llegó de la nómina sin regla. */
export interface PuestoSinRegla {
  origen_nomina: OrigenNomina;
  nombre: string;
  clave: string;
  personas: number;
  empresas: string[];
  /** Ya se le creó regla: entra en el próximo sync. */
  con_regla: boolean;
}

export interface OpcionesReglas {
  origenes: OrigenNomina[];
  grupos: GrupoArea[];
  permisos: string[];
  niveles: string[];
  default_por_grupo: Record<string, { permiso_escaneo: string; nivel_acceso_interno: string | null }>;
}

/**
 * Reglas de clasificación del sync SYS21 (prefijo /emp_sync/reglas). Leer pide
 * emp_sync:read; crear/editar/borrar además exige super-admin (el back responde 403).
 * Los cambios aplican en la siguiente corrida del sync.
 */
@Injectable({ providedIn: 'root' })
export class ReglaClasificacionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_URL}/emp_sync/reglas`;

  list(f: { origen?: string; grupo?: string; buscar?: string } = {}): Observable<ReglaClasificacion[]> {
    let params = new HttpParams();
    if (f.origen) params = params.set('origen', f.origen);
    if (f.grupo) params = params.set('grupo', f.grupo);
    if (f.buscar) params = params.set('buscar', f.buscar);
    return this.http.get<ReglaClasificacion[]>(this.base, { params });
  }

  sinRegla(origen?: string): Observable<PuestoSinRegla[]> {
    let params = new HttpParams();
    if (origen) params = params.set('origen', origen);
    return this.http.get<PuestoSinRegla[]>(`${this.base}/sin-regla`, { params });
  }

  opciones(): Observable<OpcionesReglas> {
    return this.http.get<OpcionesReglas>(`${this.base}/opciones`);
  }

  create(payload: ReglaCreate): Observable<ReglaClasificacion> {
    return this.http.post<ReglaClasificacion>(this.base, payload);
  }

  update(id: number, payload: ReglaUpdate): Observable<ReglaClasificacion> {
    return this.http.patch<ReglaClasificacion>(`${this.base}/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
