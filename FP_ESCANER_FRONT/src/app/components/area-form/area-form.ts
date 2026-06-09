import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  AreaTrabajo,
  AreaTrabajoCreate,
  AreaTrabajoUpdate,
} from '../../core/interfaces/area-trabajo';
import { Estado } from '../../core/interfaces/common';
import { Empresa } from '../../core/interfaces/empresa';
import { coordsToWkt, wktToCoords } from '../../core/utils/geo';

@Component({
  selector: 'app-area-form',
  imports: [ReactiveFormsModule],
  templateUrl: './area-form.html',
  styleUrl: './area-form.scss',
})
export class AreaForm {
  private readonly fb = inject(FormBuilder);

  /** Área a editar; null = creación. */
  readonly area = input<AreaTrabajo | null>(null);
  /** Empresas disponibles para el selector. */
  readonly empresas = input<Empresa[]>([]);
  readonly save = output<AreaTrabajoCreate | AreaTrabajoUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.area() !== null);

  readonly form = this.fb.group({
    nombre_area: this.fb.nonNullable.control('', Validators.required),
    descripcion: this.fb.nonNullable.control(''),
    id_empresa: this.fb.nonNullable.control(0, Validators.min(1)),
    hora_entrada: this.fb.nonNullable.control(''),
    estado: this.fb.nonNullable.control('activo' as Estado),
    coordenadas: this.fb.nonNullable.array<ReturnType<AreaForm['buildCoord']>>([]),
  });

  get coordenadas() {
    return this.form.controls.coordenadas;
  }

  constructor() {
    effect(() => {
      const a = this.area();
      this.coordenadas.clear();
      wktToCoords(a?.ubicacion).forEach((c) =>
        this.coordenadas.push(this.buildCoord(c.lat, c.lng)),
      );
      this.form.patchValue({
        nombre_area: a?.nombre_area ?? '',
        descripcion: a?.descripcion ?? '',
        id_empresa: a?.id_empresa ?? 0,
        hora_entrada: a?.hora_entrada ?? '',
        estado: a?.estado ?? 'activo',
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
    const { nombre_area, descripcion, id_empresa, hora_entrada, estado } =
      this.form.getRawValue();
    const ubicacion = coordsToWkt(this.coordenadas.getRawValue());

    this.save.emit({
      nombre_area,
      descripcion: descripcion || undefined,
      id_empresa,
      hora_entrada: hora_entrada || undefined,
      estado,
      ubicacion,
    });
  }
}
