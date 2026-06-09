import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { Empresa, EmpresaCreate, EmpresaUpdate } from '../core/interfaces/empresa';

@Injectable({ providedIn: 'root' })
export class EmpresaService extends BaseCrud<Empresa, EmpresaCreate, EmpresaUpdate> {
  protected readonly resource = 'empresas';
}
