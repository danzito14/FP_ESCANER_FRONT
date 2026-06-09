import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import {
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate,
} from '../core/interfaces/trabajador';

@Injectable({ providedIn: 'root' })
export class TrabajadorService extends BaseCrud<
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate
> {
  protected readonly resource = 'trabajadores';
}
