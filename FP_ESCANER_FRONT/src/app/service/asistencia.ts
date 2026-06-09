import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { Asistencia } from '../core/interfaces/asistencia';

@Injectable({ providedIn: 'root' })
export class AsistenciaService extends BaseCrud<Asistencia> {
  protected readonly resource = 'asistencias';
}
