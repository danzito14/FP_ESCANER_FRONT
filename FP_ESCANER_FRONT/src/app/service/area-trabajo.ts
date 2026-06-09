import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import {
  AreaTrabajo,
  AreaTrabajoCreate,
  AreaTrabajoUpdate,
} from '../core/interfaces/area-trabajo';

@Injectable({ providedIn: 'root' })
export class AreaTrabajoService extends BaseCrud<
  AreaTrabajo,
  AreaTrabajoCreate,
  AreaTrabajoUpdate
> {
  protected readonly resource = 'areas';
}
