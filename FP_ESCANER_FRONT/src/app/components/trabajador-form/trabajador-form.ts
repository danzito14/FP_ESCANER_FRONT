import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { EstadoTrabajador } from '../../core/interfaces/common';
import { Empresa } from '../../core/interfaces/empresa';
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
  /** Empresas disponibles para el selector. */
  readonly empresas = input<Empresa[]>([]);
  /** Áreas disponibles (todas); se filtran por empresa. */
  readonly areas = input<AreaTrabajo[]>([]);
  readonly save = output<TrabajadorCreate | TrabajadorUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.trabajador() !== null);

  /** Empresa elegida (solo para filtrar áreas; no se envía al backend). */
  readonly empresaSel = signal(0);

  /** Áreas de la empresa seleccionada. */
  readonly areasFiltradas = computed(() => {
    const emp = this.empresaSel();
    return emp ? this.areas().filter((a) => a.id_empresa === emp) : [];
  });

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    id_area: [0, Validators.min(1)],
    estado: ['activo' as EstadoTrabajador],
  });

  constructor() {
    effect(() => {
      const t = this.trabajador();
      // En edición, deduce la empresa a partir del área del trabajador.
      const empresaDeArea = t
        ? (this.areas().find((a) => a.id_area === t.id_area)?.id_empresa ?? 0)
        : 0;
      this.empresaSel.set(empresaDeArea);
      this.form.reset({
        nombre: t?.nombre ?? '',
        apellido: t?.apellido ?? '',
        id_area: t?.id_area ?? 0,
        estado: t?.estado ?? 'activo',
      });
    });
  }

  onEmpresa(e: Event): void {
    this.empresaSel.set(+(e.target as HTMLSelectElement).value);
    this.form.controls.id_area.setValue(0); // resetea el área al cambiar de empresa
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
