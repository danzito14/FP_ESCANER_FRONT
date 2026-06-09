import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { Rol } from '../core/interfaces/rol';

@Injectable({ providedIn: 'root' })
export class RolService extends BaseCrud<Rol> {
  protected readonly resource = 'roles';
}
