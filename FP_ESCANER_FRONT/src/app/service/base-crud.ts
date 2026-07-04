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

  /**
   * Nombre del query param del endpoint GET /recurso/buscar (búsqueda parcial por
   * id como texto, p. ej. 'id_usuario'). null = el recurso no expone /buscar.
   */
  protected readonly idParam: string | null = null;

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
      idArea?: number;
      /** Búsqueda parcial por nº de empleado (solo trabajadores). */
      idEmp?: string;
      /** true = solo con rostro, false = solo sin rostro, undefined = todos (solo trabajadores). */
      conRostro?: boolean;
    } = {},
  ): Observable<T[]> {
    let params = new HttpParams()
      .set('skip', opts.skip ?? 0)
      .set('limit', opts.limit ?? 100);
    const nombre = opts.nombre?.trim();
    const idEmp = opts.idEmp?.trim();
    if (nombre) params = params.set('nombre', nombre);
    if (idEmp) params = params.set('id_emp', idEmp);
    if (opts.fechaInicio) params = params.set('fecha_inicio', opts.fechaInicio);
    if (opts.fechaFin) params = params.set('fecha_fin', opts.fechaFin);
    if (opts.idEmpresa) params = params.set('id_empresa', opts.idEmpresa);
    if (opts.idArea) params = params.set('id_area', opts.idArea);
    if (opts.conRostro !== undefined) params = params.set('con_rostro', opts.conRostro);
    return this.http.get<T[]>(this.baseUrl, { params });
  }

  /**
   * GET /recurso/buscar?<idParam>=term — búsqueda parcial por id (ILIKE sobre el id
   * como texto). Las páginas la usan cuando el término es solo dígitos; si el recurso
   * no declara `idParam`, cae a list() normal.
   */
  buscarPorId(term: string, opts: { skip?: number; limit?: number } = {}): Observable<T[]> {
    const param = this.idParam;
    if (!param) return this.list({ skip: opts.skip, limit: opts.limit });
    const params = new HttpParams()
      .set('skip', opts.skip ?? 0)
      .set('limit', opts.limit ?? 100)
      .set(param, term.trim());
    return this.http.get<T[]>(`${this.baseUrl}/buscar`, { params });
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
    opts: {
      nombre?: string;
      idEmpresa?: number;
      idArea?: number;
      idEmp?: string;
      conRostro?: boolean;
      tamLote?: number;
    } = {},
  ): Observable<T[]> {
    const tamLote = opts.tamLote ?? 500;
    const lote = (skip: number) =>
      this.list({
        nombre: opts.nombre, idEmpresa: opts.idEmpresa, idArea: opts.idArea,
        idEmp: opts.idEmp, conRostro: opts.conRostro, skip, limit: tamLote,
      });

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
