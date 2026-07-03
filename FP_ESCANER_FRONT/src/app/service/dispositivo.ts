import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import {
  Dispositivo,
  DispositivoCreate,
  DispositivoUpdate,
} from '../core/interfaces/dispositivo';

@Injectable({ providedIn: 'root' })
export class DispositivoService extends BaseCrud<
  Dispositivo,
  DispositivoCreate,
  DispositivoUpdate
> {
  protected readonly resource = 'dispositivos';
  protected override readonly idParam = 'id_dispositivo';
}
