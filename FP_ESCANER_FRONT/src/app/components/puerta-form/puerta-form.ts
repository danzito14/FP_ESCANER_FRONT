import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { Estado, TipoAcceso } from '../../core/interfaces/common';
import { Dispositivo } from '../../core/interfaces/dispositivo';
import { Empresa } from '../../core/interfaces/empresa';
import {
  PuertaAcceso,
  PuertaAccesoCreate,
  PuertaAccesoUpdate,
} from '../../core/interfaces/puerta-acceso';
import { Coordenada, lngLatToWkt, pointToWkt, wktToPoint } from '../../core/utils/geo';
import { MapPicker } from '../map-picker/map-picker';

@Component({
  selector: 'app-puerta-form',
  imports: [ReactiveFormsModule, MapPicker],
  templateUrl: './puerta-form.html',
  styleUrl: './puerta-form.scss',
})
export class PuertaForm {
  private readonly fb = inject(FormBuilder);

  /** Puerta a editar; null = creación. */
  readonly puerta = input<PuertaAcceso | null>(null);
  readonly areas = input<AreaTrabajo[]>([]);
  readonly empresas = input<Empresa[]>([]);
  readonly dispositivos = input<Dispositivo[]>([]);
  readonly save = output<PuertaAccesoCreate | PuertaAccesoUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.puerta() !== null);

  /** Mirrors de empresa/área para reactividad (cascada + contexto del mapa). */
  readonly idEmpresaSel = signal(0);
  readonly idAreaSel = signal(0);

  readonly areasFiltradas = computed(() => {
    const emp = this.idEmpresaSel();
    return emp ? this.areas().filter((a) => a.id_empresa === emp) : this.areas();
  });

  /** Polígono del área elegida (contexto del mapa). */
  readonly areaContextoWkt = computed(() => {
    const a = this.areas().find((x) => x.id_area === this.idAreaSel());
    return a?.ubicacion ?? lngLatToWkt(a?.coordenadas);
  });

  /** Geometría inicial para el mapa (acepta WKT o latitud/longitud). */
  readonly mapWkt = computed(() => {
    const p = this.puerta();
    if (p?.ubicacion) return p.ubicacion;
    if (p?.latitud != null && p?.longitud != null) {
      return pointToWkt({ lat: p.latitud, lng: p.longitud });
    }
    return undefined;
  });

  readonly form = this.fb.group({
    nombre_puerta: this.fb.nonNullable.control('', Validators.required),
    id_area: this.fb.nonNullable.control(0),
    id_empresa: this.fb.nonNullable.control(0),
    id_dispositivo: this.fb.nonNullable.control(0),
    tipo_acceso: this.fb.nonNullable.control('bidireccional' as TipoAcceso),
    requiere_autorizacion: this.fb.nonNullable.control(false),
    estado: this.fb.nonNullable.control('activo' as Estado),
    lat: this.fb.control<number | null>(null),
    lng: this.fb.control<number | null>(null),
  });

  constructor() {
    effect(() => {
      const p = this.puerta();
      const punto = p?.ubicacion
        ? wktToPoint(p.ubicacion)
        : p?.latitud != null && p?.longitud != null
          ? { lat: p.latitud, lng: p.longitud }
          : null;
      this.idEmpresaSel.set(p?.id_empresa ?? 0);
      this.idAreaSel.set(p?.id_area ?? 0);
      this.form.reset({
        nombre_puerta: p?.nombre_puerta ?? '',
        id_area: p?.id_area ?? 0,
        id_empresa: p?.id_empresa ?? 0,
        id_dispositivo: p?.id_dispositivo ?? 0,
        tipo_acceso: p?.tipo_acceso ?? 'bidireccional',
        requiere_autorizacion: p?.requiere_autorizacion ?? false,
        estado: p?.estado ?? 'activo',
        lat: punto?.lat ?? null,
        lng: punto?.lng ?? null,
      });
    });
  }

  onEmpresa(): void {
    this.idEmpresaSel.set(this.form.controls.id_empresa.value);
    this.form.controls.id_area.setValue(0);
    this.idAreaSel.set(0);
  }

  onArea(): void {
    this.idAreaSel.set(this.form.controls.id_area.value);
  }

  onMapCoords(coords: Coordenada[]): void {
    const p = coords[0];
    this.form.patchValue({ lat: p?.lat ?? null, lng: p?.lng ?? null });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();

    this.save.emit({
      nombre_puerta: v.nombre_puerta,
      id_area: v.id_area || undefined,
      id_empresa: v.id_empresa || undefined,
      id_dispositivo: v.id_dispositivo || undefined,
      tipo_acceso: v.tipo_acceso,
      requiere_autorizacion: v.requiere_autorizacion,
      estado: v.estado,
      latitud: v.lat ?? undefined,
      longitud: v.lng ?? undefined,
    });
  }
}
