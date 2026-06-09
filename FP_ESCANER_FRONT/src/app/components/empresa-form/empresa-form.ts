import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Estado } from '../../core/interfaces/common';
import { Empresa, EmpresaCreate, EmpresaUpdate } from '../../core/interfaces/empresa';
import { coordsToWkt, wktToCoords } from '../../core/utils/geo';

@Component({
  selector: 'app-empresa-form',
  imports: [ReactiveFormsModule],
  templateUrl: './empresa-form.html',
  styleUrl: './empresa-form.scss',
})
export class EmpresaForm {
  private readonly fb = inject(FormBuilder);

  /** Empresa a editar; null = creación. */
  readonly empresa = input<Empresa | null>(null);
  readonly save = output<EmpresaCreate | EmpresaUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.empresa() !== null);

  readonly form = this.fb.group({
    nombre_empresa: this.fb.nonNullable.control('', Validators.required),
    zona_horaria: this.fb.nonNullable.control('America/Mazatlan', Validators.required),
    estado: this.fb.nonNullable.control('activo' as Estado),
    coordenadas: this.fb.nonNullable.array<ReturnType<EmpresaForm['buildCoord']>>([]),
  });

  get coordenadas() {
    return this.form.controls.coordenadas;
  }

  constructor() {
    effect(() => {
      const e = this.empresa();
      this.coordenadas.clear();
      wktToCoords(e?.ubicacion).forEach((c) =>
        this.coordenadas.push(this.buildCoord(c.lat, c.lng)),
      );
      this.form.patchValue({
        nombre_empresa: e?.nombre_empresa ?? '',
        zona_horaria: e?.zona_horaria ?? 'America/Mazatlan',
        estado: e?.estado ?? 'activo',
      });
    });
  }

  private buildCoord(lat = 0, lng = 0) {
    return this.fb.nonNullable.group({
      lat: [lat, Validators.required],
      lng: [lng, Validators.required],
    });
  }

  addCoordenada(): void {
    this.coordenadas.push(this.buildCoord());
  }

  removeCoordenada(index: number): void {
    this.coordenadas.removeAt(index);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nombre_empresa, zona_horaria, estado } = this.form.getRawValue();
    const ubicacion = coordsToWkt(this.coordenadas.getRawValue());

    this.save.emit({ nombre_empresa, zona_horaria, estado, ubicacion });
  }
}
