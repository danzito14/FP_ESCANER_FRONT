import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import {
  EstadoTrabajador,
  NivelAccesoInterno,
  PermisoEscaneo,
} from '../../core/interfaces/common';
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

  /** Mirror del permiso: si es 'campo', el nivel interno se fuerza a "Sin permisos". */
  readonly permisoSel = signal<PermisoEscaneo>('campo');
  readonly esCampo = computed(() => this.permisoSel() === 'campo');

  /** Áreas de la empresa seleccionada. */
  readonly areasFiltradas = computed(() => {
    const emp = this.empresaSel();
    return emp ? this.areas().filter((a) => a.id_empresa === emp) : [];
  });

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    id_emp: [''],
    id_area: [0, Validators.min(1)],
    estado: ['activo' as EstadoTrabajador],
    permiso_escaneo: ['campo' as PermisoEscaneo],
    // '' = "Sin permisos" (se envía como null al backend).
    nivel_acceso_interno: ['' as NivelAccesoInterno | ''],
  });

  constructor() {
    effect(() => {
      const t = this.trabajador();
      // En edición, deduce la empresa a partir del área del trabajador.
      const empresaDeArea = t
        ? (this.areas().find((a) => a.id_area === t.id_area)?.id_empresa ?? 0)
        : 0;
      const permiso = t?.permiso_escaneo ?? 'campo';
      this.empresaSel.set(empresaDeArea);
      this.permisoSel.set(permiso);
      this.form.reset({
        nombre: t?.nombre ?? '',
        apellido: t?.apellido ?? '',
        id_emp: t?.id_emp ?? '',
        id_area: t?.id_area ?? 0,
        estado: t?.estado ?? 'activo',
        permiso_escaneo: permiso,
        nivel_acceso_interno: t?.nivel_acceso_interno ?? '',
      });
      // OJO: pasar `permiso` explícito; NO leer permisoSel()/esCampo() aquí,
      // o el effect rastrearía esa señal y se re-ejecutaría al cambiar el select.
      this.sincronizarNivel(permiso);
    });
  }

  onEmpresa(e: Event): void {
    this.empresaSel.set(+(e.target as HTMLSelectElement).value);
    this.form.controls.id_area.setValue(0); // resetea el área al cambiar de empresa
  }

  /** Al cambiar el permiso: 'campo' fuerza "Sin permisos" (null) y bloquea el nivel. */
  onPermiso(): void {
    const permiso = this.form.controls.permiso_escaneo.value;
    this.permisoSel.set(permiso);
    this.sincronizarNivel(permiso);
  }

  /** Mantiene el nivel interno coherente con el permiso de escaneo. */
  private sincronizarNivel(permiso: PermisoEscaneo): void {
    const ctrl = this.form.controls.nivel_acceso_interno;
    if (permiso === 'campo') {
      ctrl.setValue(''); // Sin permisos
      ctrl.disable();
    } else if (ctrl.disabled) {
      ctrl.enable();
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nombre, apellido, id_emp, id_area, estado, permiso_escaneo, nivel_acceso_interno } =
      this.form.getRawValue();
    // "Sin permisos" ('') se envía como null al backend.
    const nivel = nivel_acceso_interno || null;
    // id_emp vacío → null (alta manual sin nº de nómina).
    const emp = id_emp.trim() || null;

    if (this.isEdit()) {
      this.save.emit({
        nombre,
        apellido,
        id_emp: emp,
        id_area,
        estado,
        permiso_escaneo,
        nivel_acceso_interno: nivel,
      });
    } else {
      this.save.emit({
        nombre,
        apellido,
        id_emp: emp,
        id_area,
        permiso_escaneo,
        nivel_acceso_interno: nivel,
      } satisfies TrabajadorCreate);
    }
  }
}
