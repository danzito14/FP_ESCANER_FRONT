import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { Rol, RolCreate, RolUpdate } from '../core/interfaces/rol';

@Injectable({ providedIn: 'root' })
export class RolService extends BaseCrud<Rol, RolCreate, RolUpdate> {
  protected readonly resource = 'roles';
  protected override readonly idParam = 'id_rol';
}
