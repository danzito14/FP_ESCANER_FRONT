import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { EstadoDispositivo, TipoDispositivo } from '../../core/interfaces/common';
import {
  Dispositivo,
  DispositivoCreate,
  DispositivoUpdate,
} from '../../core/interfaces/dispositivo';
import { pointToWkt, wktToPoint } from '../../core/utils/geo';

@Component({
  selector: 'app-dispositivo-form',
  imports: [ReactiveFormsModule],
  templateUrl: './dispositivo-form.html',
  styleUrl: './dispositivo-form.scss',
})
export class DispositivoForm {
  private readonly fb = inject(FormBuilder);

  /** Dispositivo a editar; null = creación. */
  readonly dispositivo = input<Dispositivo | null>(null);
  /** Áreas disponibles para el selector. */
  readonly areas = input<AreaTrabajo[]>([]);
  readonly save = output<DispositivoCreate | DispositivoUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.dispositivo() !== null);

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
      const punto = wktToPoint(d?.ubicacion);
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

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const ubicacion =
      v.lat != null && v.lng != null
        ? pointToWkt({ lat: v.lat, lng: v.lng })
        : undefined;

    this.save.emit({
      nombre_dispositivo: v.nombre_dispositivo,
      tipo_dispositivo: v.tipo_dispositivo,
      ip_dispositivo: v.ip_dispositivo || undefined,
      puerto: v.puerto ?? undefined,
      id_area: v.id_area || undefined,
      estado: v.estado,
      fecha_instalacion: v.fecha_instalacion || undefined,
      ubicacion,
    });
  }
}
