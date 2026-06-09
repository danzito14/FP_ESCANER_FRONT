import { Injectable } from '@angular/core';

import { BaseCrud } from './base-crud';
import { Usuario, UsuarioCreate, UsuarioUpdate } from '../core/interfaces/usuario';

@Injectable({ providedIn: 'root' })
export class UsuarioService extends BaseCrud<Usuario, UsuarioCreate, UsuarioUpdate> {
  protected readonly resource = 'usuarios';
}
