import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Estado } from '../../core/interfaces/common';
import { Empresa, EmpresaCreate, EmpresaUpdate } from '../../core/interfaces/empresa';
import {
  Coordenada,
  coordsToLngLat,
  lngLatToCoords,
  lngLatToWkt,
  polygonAreaHectares,
  wktToCoords,
} from '../../core/utils/geo';
import { areaHectareasValidator } from '../../core/utils/validators';
import { MapPicker } from '../map-picker/map-picker';

@Component({
  selector: 'app-empresa-form',
  imports: [ReactiveFormsModule, MapPicker],
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
  /** Geometría inicial para el mapa (acepta WKT o arreglo de coordenadas). */
  readonly mapWkt = computed(() => {
    const e = this.empresa();
    return e?.ubicacion ?? lngLatToWkt(e?.coordenadas);
  });

  readonly form = this.fb.group({
    nombre_empresa: this.fb.nonNullable.control('', Validators.required),
    zona_horaria: this.fb.nonNullable.control('America/Mazatlan', Validators.required),
    estado: this.fb.nonNullable.control('activo' as Estado),
    coordenadas: this.fb.nonNullable.array<ReturnType<EmpresaForm['buildCoord']>>(
      [],
      areaHectareasValidator(5, 150),
    ),
  });

  get coordenadas() {
    return this.form.controls.coordenadas;
  }

  /** Área actual del polígono en hectáreas. */
  get areaHa(): number {
    return polygonAreaHectares(this.coordenadas.getRawValue());
  }

  constructor() {
    effect(() => {
      const e = this.empresa();
      this.coordenadas.clear();
      const puntos = e?.ubicacion ? wktToCoords(e.ubicacion) : lngLatToCoords(e?.coordenadas);
      puntos.forEach((c) => this.coordenadas.push(this.buildCoord(c.lat, c.lng)));
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

  /** El mapa dibujó/editó el polígono: reemplaza los vértices. */
  onMapCoords(coords: Coordenada[]): void {
    this.coordenadas.clear();
    coords.forEach((c) => this.coordenadas.push(this.buildCoord(c.lat, c.lng)));
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
    const coordenadas = coordsToLngLat(this.coordenadas.getRawValue());

    this.save.emit({
      nombre_empresa,
      zona_horaria,
      estado,
      coordenadas: coordenadas.length ? coordenadas : undefined,
    });
  }
}
