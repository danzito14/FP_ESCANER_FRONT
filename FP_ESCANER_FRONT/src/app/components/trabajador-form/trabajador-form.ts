import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { EstadoTrabajador } from '../../core/interfaces/common';
import {
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate,
} from '../../core/interfaces/trabajador';

@Component({
  selector: 'app-trabajador-form',
  imports: [ReactiveFormsModule],
  templateUrl: './trabajador-form.html',
  styleUrl: './trabajador-form.scss',
})
export class TrabajadorForm {
  private readonly fb = inject(FormBuilder);

  /** Trabajador a editar; null = creación. */
  readonly trabajador = input<Trabajador | null>(null);
  /** Áreas disponibles para el selector. */
  readonly areas = input<AreaTrabajo[]>([]);
  readonly save = output<TrabajadorCreate | TrabajadorUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.trabajador() !== null);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    id_area: [0, Validators.min(1)],
    estado: ['activo' as EstadoTrabajador],
  });

  constructor() {
    effect(() => {
      const t = this.trabajador();
      this.form.reset({
        nombre: t?.nombre ?? '',
        apellido: t?.apellido ?? '',
        id_area: t?.id_area ?? 0,
        estado: t?.estado ?? 'activo',
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nombre, apellido, id_area, estado } = this.form.getRawValue();

    if (this.isEdit()) {
      this.save.emit({ nombre, apellido, id_area, estado });
    } else {
      this.save.emit({ nombre, apellido, id_area } satisfies TrabajadorCreate);
    }
  }
}
