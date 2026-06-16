import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { MapPicker } from '../map-picker/map-picker';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { EstadoDispositivo, TipoDispositivo } from '../../core/interfaces/common';
import {
  Dispositivo,
  DispositivoCreate,
  DispositivoUpdate,
} from '../../core/interfaces/dispositivo';
import { Empresa } from '../../core/interfaces/empresa';
import { Coordenada, lngLatToWkt, pointToWkt, wktToPoint } from '../../core/utils/geo';

@Component({
  selector: 'app-dispositivo-form',
  imports: [ReactiveFormsModule, MapPicker],
  templateUrl: './dispositivo-form.html',
  styleUrl: './dispositivo-form.scss',
})
export class DispositivoForm {
  private readonly fb = inject(FormBuilder);

  /** Dispositivo a editar; null = creación. */
  readonly dispositivo = input<Dispositivo | null>(null);
  /** Empresas disponibles para el selector. */
  readonly empresas = input<Empresa[]>([]);
  /** Áreas disponibles (todas); se filtran por empresa. */
  readonly areas = input<AreaTrabajo[]>([]);
  readonly save = output<DispositivoCreate | DispositivoUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.dispositivo() !== null);

  /** Empresa elegida (solo filtra áreas; no se envía). */
  readonly empresaSel = signal(0);
  /** Área elegida (mirror del form para reactividad). */
  readonly idAreaSel = signal(0);

  readonly areasFiltradas = computed(() => {
    const emp = this.empresaSel();
    return emp ? this.areas().filter((a) => a.id_empresa === emp) : [];
  });

  /** Polígono del área elegida (contexto del mapa). */
  readonly areaContextoWkt = computed(() => {
    const a = this.areas().find((x) => x.id_area === this.idAreaSel());
    return a?.ubicacion ?? lngLatToWkt(a?.coordenadas);
  });
  /** Geometría inicial para el mapa (acepta WKT o latitud/longitud). */
  readonly mapWkt = computed(() => {
    const d = this.dispositivo();
    if (d?.ubicacion) return d.ubicacion;
    if (d?.latitud != null && d?.longitud != null) {
      return pointToWkt({ lat: d.latitud, lng: d.longitud });
    }
    return undefined;
  });

  readonly form = this.fb.group({
    nombre_dispositivo: this.fb.nonNullable.control('', Validators.required),
    tipo_dispositivo: this.fb.nonNullable.control(
      'escaner_facial' as TipoDispositivo,
      Validators.required,
    ),
    ip_dispositivo: this.fb.nonNullable.control(''),
    puerto: this.fb.control<number | null>(8080),
    id_area: this.fb.nonNullable.control(0),
    estado: this.fb.nonNullable.control('activo' as EstadoDispositivo),
    fecha_instalacion: this.fb.nonNullable.control(''),
    lat: this.fb.control<number | null>(null),
    lng: this.fb.control<number | null>(null),
  });

  constructor() {
    effect(() => {
      const d = this.dispositivo();
      const punto = d?.ubicacion
        ? wktToPoint(d.ubicacion)
        : d?.latitud != null && d?.longitud != null
          ? { lat: d.latitud, lng: d.longitud }
          : null;
      const empresaDeArea = d
        ? (this.areas().find((a) => a.id_area === d.id_area)?.id_empresa ?? 0)
        : 0;
      this.empresaSel.set(empresaDeArea);
      this.idAreaSel.set(d?.id_area ?? 0);
      this.form.reset({
        nombre_dispositivo: d?.nombre_dispositivo ?? '',
        tipo_dispositivo: d?.tipo_dispositivo ?? 'escaner_facial',
        ip_dispositivo: d?.ip_dispositivo ?? '',
        puerto: d?.puerto ?? 8080,
        id_area: d?.id_area ?? 0,
        estado: d?.estado ?? 'activo',
        fecha_instalacion: d?.fecha_instalacion ?? '',
        lat: punto?.lat ?? null,
        lng: punto?.lng ?? null,
      });
    });
  }

  onEmpresa(e: Event): void {
    this.empresaSel.set(+(e.target as HTMLSelectElement).value);
    this.form.controls.id_area.setValue(0);
    this.idAreaSel.set(0);
  }

  onArea(): void {
    // El select de área usa [ngValue]; el id correcto está en el form control.
    this.idAreaSel.set(this.form.controls.id_area.value);
  }

  /** El mapa colocó/movió el punto: refleja en lat/lng. */
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
      nombre_dispositivo: v.nombre_dispositivo,
      tipo_dispositivo: v.tipo_dispositivo,
      ip_dispositivo: v.ip_dispositivo || undefined,
      puerto: v.puerto ?? undefined,
      id_area: v.id_area || undefined,
      estado: v.estado,
      fecha_instalacion: v.fecha_instalacion || undefined,
      latitud: v.lat ?? undefined,
      longitud: v.lng ?? undefined,
    });
  }
}
