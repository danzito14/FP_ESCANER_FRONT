import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  AreaTrabajo,
  AreaTrabajoCreate,
  AreaTrabajoUpdate,
} from '../../core/interfaces/area-trabajo';
import { Estado } from '../../core/interfaces/common';
import { Empresa } from '../../core/interfaces/empresa';
import {
  Coordenada,
  coordsToLngLat,
  lngLatToCoords,
  lngLatToWkt,
  polygonAreaHectares,
  wktToCoords,
} from '../../core/utils/geo';
import { areaHectareasValidator } from '../../core/utils/validators';
import { MapFeature, MapView } from '../map-view/map-view';
import { MapPicker } from '../map-picker/map-picker';

@Component({
  selector: 'app-area-form',
  imports: [ReactiveFormsModule, MapPicker, MapView],
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
  /** Si el área es "administrativa": toma las coordenadas de la empresa. */
  readonly administrativa = signal(false);
  /** WKT del polígono de la empresa elegida (para el mapa en modo administrativa). */
  readonly adminWkt = signal<string | undefined>(undefined);
  readonly mapAdminFeatures = computed<MapFeature[]>(() => {
    const wkt = this.adminWkt();
    return wkt ? [{ id: 'empresa', wkt, label: 'Área de la empresa', color: '#3b82f6' }] : [];
  });
  /** Geometría inicial para el mapa (acepta WKT o arreglo de coordenadas). */
  readonly mapWkt = computed(() => {
    const a = this.area();
    return a?.ubicacion ?? lngLatToWkt(a?.coordenadas);
  });

  readonly form = this.fb.group({
    nombre_area: this.fb.nonNullable.control('', Validators.required),
    descripcion: this.fb.nonNullable.control(''),
    id_empresa: this.fb.nonNullable.control(0, Validators.min(1)),
    hora_entrada: this.fb.nonNullable.control(''),
    estado: this.fb.nonNullable.control('activo' as Estado),
    coordenadas: this.fb.nonNullable.array<ReturnType<AreaForm['buildCoord']>>(
      [],
      areaHectareasValidator(0.1, 300),
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
      const a = this.area();
      this.coordenadas.clear();
      const puntos = a?.ubicacion ? wktToCoords(a.ubicacion) : lngLatToCoords(a?.coordenadas);
      puntos.forEach((c) => this.coordenadas.push(this.buildCoord(c.lat, c.lng)));
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

  onMapCoords(coords: Coordenada[]): void {
    this.coordenadas.clear();
    coords.forEach((c) => this.coordenadas.push(this.buildCoord(c.lat, c.lng)));
  }

  /** Switch "área administrativa": copia las coordenadas de la empresa y relaja la validación de tamaño. */
  onAdministrativa(e: Event): void {
    const on = (e.target as HTMLInputElement).checked;
    this.administrativa.set(on);
    if (on) {
      this.coordenadas.clearValidators();
      this.copiarCoordsEmpresa();
    } else {
      // Reinicia las coordenadas para dibujar manualmente desde cero.
      this.coordenadas.clear();
      this.adminWkt.set(undefined);
      this.coordenadas.setValidators(areaHectareasValidator(0.1, 300));
    }
    this.coordenadas.updateValueAndValidity();
  }

  /** Al cambiar la empresa en modo administrativa, recopia sus coordenadas. */
  onEmpresaChange(): void {
    if (this.administrativa()) this.copiarCoordsEmpresa();
  }

  private copiarCoordsEmpresa(): void {
    const id = this.form.controls.id_empresa.value;
    const emp = this.empresas().find((e) => e.id_empresa === id);
    const pts = emp?.ubicacion ? wktToCoords(emp.ubicacion) : lngLatToCoords(emp?.coordenadas);
    this.coordenadas.clear();
    pts.forEach((c) => this.coordenadas.push(this.buildCoord(c.lat, c.lng)));
    this.adminWkt.set(emp?.ubicacion ?? lngLatToWkt(emp?.coordenadas));
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
    const coordenadas = coordsToLngLat(this.coordenadas.getRawValue());

    this.save.emit({
      nombre_area,
      descripcion: descripcion || undefined,
      id_empresa,
      hora_entrada: hora_entrada || undefined,
      estado,
      coordenadas: coordenadas.length ? coordenadas : undefined,
    });
  }
}
