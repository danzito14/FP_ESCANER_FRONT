import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { Incidencia, IncidenciaUpdate } from '../core/interfaces/incidencia';

@Injectable({ providedIn: 'root' })
export class IncidenciaService extends BaseCrud<Incidencia, never, IncidenciaUpdate> {
  protected readonly resource = 'incidencias';
}
