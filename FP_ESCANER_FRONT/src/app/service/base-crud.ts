import { inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../core/constants/api';

/**
 * Servicio CRUD genérico reutilizable por cada módulo.
 * Las clases hijas solo declaran el `resource` (prefijo de ruta del backend).
 *
 *   @Injectable({ providedIn: 'root' })
 *   export class UsuarioService extends BaseCrud<Usuario, UsuarioCreate, UsuarioUpdate> {
 *     protected readonly resource = 'usuarios';
 *   }
 */
export abstract class BaseCrud<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  protected readonly http = inject(HttpClient);

  /** Prefijo de ruta del recurso, ej: 'usuarios'. */
  protected abstract readonly resource: string;

  protected get baseUrl(): string {
    return `${API_URL}/${this.resource}`;
  }

  /**
   * GET /recurso?skip=&limit=&nombre=&fecha_inicio=&fecha_fin=&id_empresa=
   * - nombre: búsqueda server-side opcional.
   * - fechaInicio/fechaFin ('YYYY-MM-DD'): rango opcional (asistencias/incidencias).
   * - idEmpresa: filtro por empresa server-side (máx. backend: limit ≤ 500).
   */
  list(
    opts: {
      skip?: number;
      limit?: number;
      nombre?: string;
      fechaInicio?: string;
      fechaFin?: string;
      idEmpresa?: number;
    } = {},
  ): Observable<T[]> {
    let params = new HttpParams()
      .set('skip', opts.skip ?? 0)
      .set('limit', opts.limit ?? 100);
    const nombre = opts.nombre?.trim();
    if (nombre) params = params.set('nombre', nombre);
    if (opts.fechaInicio) params = params.set('fecha_inicio', opts.fechaInicio);
    if (opts.fechaFin) params = params.set('fecha_fin', opts.fechaFin);
    if (opts.idEmpresa) params = params.set('id_empresa', opts.idEmpresa);
    return this.http.get<T[]>(this.baseUrl, { params });
  }

  /** GET /recurso/{id} (id int para catálogos, UUID string para eventos). */
  getById(id: number | string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${id}`);
  }

  /** POST /recurso */
  create(data: TCreate): Observable<T> {
    return this.http.post<T>(this.baseUrl, data);
  }

  /** PUT /recurso/{id} */
  update(id: number | string, data: TUpdate): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}/${id}`, data);
  }

  /** DELETE /recurso/{id} (baja lógica) */
  remove(id: number | string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}/${id}`);
  }
}
