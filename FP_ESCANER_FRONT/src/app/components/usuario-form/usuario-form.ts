import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Estado } from '../../core/interfaces/common';
import { Empresa } from '../../core/interfaces/empresa';
import { Rol } from '../../core/interfaces/rol';
import { Usuario, UsuarioCreate, UsuarioUpdate } from '../../core/interfaces/usuario';

@Component({
  selector: 'app-usuario-form',
  imports: [ReactiveFormsModule],
  templateUrl: './usuario-form.html',
  styleUrl: './usuario-form.scss',
})
export class UsuarioForm {
  private readonly fb = inject(FormBuilder);

  /** Usuario a editar; null = creación. */
  readonly usuario = input<Usuario | null>(null);
  /** Roles disponibles para el selector. */
  readonly roles = input<Rol[]>([]);
  /** Empresas disponibles para el selector. */
  readonly empresas = input<Empresa[]>([]);
  readonly save = output<UsuarioCreate | UsuarioUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.usuario() !== null);

  readonly form = this.fb.nonNullable.group({
    nombre_usuario: ['', Validators.required],
    contrasena: [''],
    id_rol: [0, Validators.min(1)],
    empresa: [0, Validators.min(1)],
    estado: ['activo' as Estado],
  });

  constructor() {
    effect(() => {
      const u = this.usuario();
      this.form.reset({
        nombre_usuario: u?.nombre_usuario ?? '',
        contrasena: '',
        id_rol: u?.id_rol ?? 0,
        empresa: u?.empresa ?? 0,
        estado: u?.estado ?? 'activo',
      });
    });
  }

  onSubmit(): void {
    if (!this.isEdit() && !this.form.controls.contrasena.value) {
      this.form.controls.contrasena.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { nombre_usuario, contrasena, id_rol, empresa, estado } = this.form.getRawValue();

    if (this.isEdit()) {
      const payload: UsuarioUpdate = { nombre_usuario, id_rol, empresa, estado };
      if (contrasena) payload.contrasena = contrasena;
      this.save.emit(payload);
    } else {
      this.save.emit({ nombre_usuario, contrasena, id_rol, empresa } satisfies UsuarioCreate);
    }
  }
}
