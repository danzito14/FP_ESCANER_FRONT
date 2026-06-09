import { Component, computed, effect, inject, input, output } from '@angular/core';
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
import { pointToWkt, wktToPoint } from '../../core/utils/geo';

@Component({
  selector: 'app-puerta-form',
  imports: [ReactiveFormsModule],
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
      const punto = wktToPoint(p?.ubicacion);
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
      nombre_puerta: v.nombre_puerta,
      id_area: v.id_area || undefined,
      id_empresa: v.id_empresa || undefined,
      id_dispositivo: v.id_dispositivo || undefined,
      tipo_acceso: v.tipo_acceso,
      requiere_autorizacion: v.requiere_autorizacion,
      estado: v.estado,
      ubicacion,
    });
  }
}
