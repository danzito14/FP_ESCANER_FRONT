import { inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, expand, scan } from 'rxjs';

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

  /**
   * Carga progresiva de TODOS los registros en lotes (para tablas grandes, ej.
   * +15k trabajadores, donde el `limit` por defecto solo traía 100).
   *
   * Pide /recurso por páginas de `tamLote` y EMITE el acumulado tras cada lote,
   * así la tabla muestra el primer lote al instante y va creciendo sola. Termina
   * cuando un lote vuelve incompleto (< tamLote filas) = ya no hay más.
   *
   * Conserva los mismos filtros server-side de list() (nombre, idEmpresa); el
   * resto del filtrado (área/estado) sigue siendo client-side sobre el acumulado.
   */
  listAll(
    opts: { nombre?: string; idEmpresa?: number; tamLote?: number } = {},
  ): Observable<T[]> {
    const tamLote = opts.tamLote ?? 500;
    const lote = (skip: number) =>
      this.list({ nombre: opts.nombre, idEmpresa: opts.idEmpresa, skip, limit: tamLote });

    return lote(0).pipe(
      // i = índice de iteración de expand: el lote ya emitido es la página i,
      // así que el siguiente skip es (i + 1) * tamLote.
      expand((filas, i) => (filas.length < tamLote ? EMPTY : lote((i + 1) * tamLote))),
      scan((acc, filas) => acc.concat(filas), [] as T[]),
    );
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
