import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BaseCrud } from './base-crud';
import { EMPRESA_SUPERADMIN } from '../core/constants/empresa';
import { Empresa, EmpresaCreate, EmpresaUpdate } from '../core/interfaces/empresa';

@Injectable({ providedIn: 'root' })
export class EmpresaService extends BaseCrud<Empresa, EmpresaCreate, EmpresaUpdate> {
  protected readonly resource = 'empresas';
  protected override readonly idParam = 'id';

  /** Lista omitiendo la empresa del super-admin (99): no se ve ni se edita. */
  override list(opts: Parameters<BaseCrud<Empresa>['list']>[0] = {}): Observable<Empresa[]> {
    return super
      .list(opts)
      .pipe(map((arr) => arr.filter((e) => e.id_empresa !== EMPRESA_SUPERADMIN)));
  }

  /** Búsqueda por id, también ocultando al super-admin (99). */
  override buscarPorId(
    term: string,
    opts: Parameters<BaseCrud<Empresa>['buscarPorId']>[1] = {},
  ): Observable<Empresa[]> {
    return super
      .buscarPorId(term, opts)
      .pipe(map((arr) => arr.filter((e) => e.id_empresa !== EMPRESA_SUPERADMIN)));
  }
}
