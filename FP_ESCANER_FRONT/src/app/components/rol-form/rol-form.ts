import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Estado } from '../../core/interfaces/common';
import { Rol, RolCreate, RolUpdate } from '../../core/interfaces/rol';
import { expandirScopes } from '../../core/utils/scopes';

interface RecursoDef {
  key: string;
  label: string;
  acciones: string[];
}

interface Preset {
  label: string;
  scopes: string[];
}

const ACCIONES: { key: string; label: string }[] = [
  { key: 'read', label: 'Ver' },
  { key: 'write', label: 'Crear / Editar' },
  { key: 'delete', label: 'Borrar' },
];

/** Recursos y las acciones que tienen sentido en el backend. */
const RECURSOS: RecursoDef[] = [
  { key: 'usuarios', label: 'Usuarios', acciones: ['read', 'write', 'delete'] },
  { key: 'roles', label: 'Roles', acciones: ['read', 'write', 'delete'] },
  { key: 'trabajadores', label: 'Trabajadores', acciones: ['read', 'write', 'delete'] },
  { key: 'embeddings', label: 'Rostros (embeddings)', acciones: ['read', 'write', 'delete'] },
  { key: 'empresas', label: 'Empresas', acciones: ['read', 'write', 'delete'] },
  { key: 'areas', label: 'Áreas', acciones: ['read', 'write', 'delete'] },
  { key: 'dispositivos', label: 'Dispositivos', acciones: ['read', 'write', 'delete'] },
  { key: 'puertas', label: 'Puertas', acciones: ['read', 'write', 'delete'] },
  { key: 'incidencias', label: 'Incidencias', acciones: ['read', 'write'] },
  { key: 'asistencias', label: 'Asistencias', acciones: ['read'] },
  { key: 'escaneos', label: 'Escaneos', acciones: ['read'] },
];

@Component({
  selector: 'app-rol-form',
  imports: [ReactiveFormsModule],
  templateUrl: './rol-form.html',
  styleUrl: './rol-form.scss',
})
export class RolForm {
  private readonly fb = inject(FormBuilder);

  /** Rol a editar; null = creación. */
  readonly rol = input<Rol | null>(null);
  readonly save = output<RolCreate | RolUpdate>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.rol() !== null);

  readonly recursos = RECURSOS;
  readonly acciones = ACCIONES;
  readonly presets: Preset[] = [
    { label: 'Acceso total', scopes: ['*'] },
    { label: 'Solo lectura', scopes: ['*:read'] },
    { label: 'Escritura', scopes: ['*:read', '*:write', 'scanner:use'] },
    { label: 'Solo scanner', scopes: ['scanner:use'] },
    { label: 'Limpiar', scopes: [] },
  ];

  /** Scopes actuales del rol (fuente de verdad del editor). */
  readonly scopes = signal<string[]>([]);
  /** Texto para agregar un scope manual. */
  readonly scopeManual = signal('');

  readonly form = this.fb.nonNullable.group({
    nombre_rol: ['', Validators.required],
    descripcion: [''],
    estado: ['activo' as Estado],
  });

  constructor() {
    effect(() => {
      const r = this.rol();
      this.form.reset({
        nombre_rol: r?.nombre_rol ?? '',
        descripcion: r?.descripcion ?? '',
        estado: r?.estado ?? 'activo',
      });
      this.scopes.set(expandirScopes(r?.permisos?.scopes));
    });
  }

  // --- Estado efectivo (considera comodines) ----------------------------

  private cubiertoEn(sc: Set<string>, recurso: string, accion: string): boolean {
    return (
      sc.has('*') ||
      sc.has(`${recurso}:${accion}`) ||
      sc.has(`*:${accion}`) ||
      sc.has(`${recurso}:*`)
    );
  }

  /** ¿La casilla recurso/acción está activa (directa o por comodín)? */
  cubierto(recurso: string, accion: string): boolean {
    return this.cubiertoEn(new Set(this.scopes()), recurso, accion);
  }

  scannerOn(): boolean {
    const sc = this.scopes();
    return sc.includes('*') || sc.includes('scanner:use');
  }

  private hayComodin(sc: Set<string>): boolean {
    return [...sc].some((s) => s.includes('*'));
  }

  /**
   * Convierte los comodines en scopes explícitos para poder activar/desactivar
   * casillas individuales sin perder el resto de permisos.
   */
  private materializar(): void {
    const sc = new Set(this.scopes());
    if (!this.hayComodin(sc)) return;
    const exp = new Set<string>();
    for (const r of RECURSOS) {
      for (const a of r.acciones) {
        if (this.cubiertoEn(sc, r.key, a)) exp.add(`${r.key}:${a}`);
      }
    }
    if (sc.has('*') || sc.has('scanner:use')) exp.add('scanner:use');
    this.scopes.set([...exp]);
  }

  // --- Acciones del editor ----------------------------------------------

  aplicarPreset(p: Preset): void {
    this.scopes.set([...p.scopes]);
  }

  toggleAccion(recurso: string, accion: string): void {
    this.materializar();
    const key = `${recurso}:${accion}`;
    const sc = new Set(this.scopes());
    if (sc.has(key)) sc.delete(key);
    else sc.add(key);
    this.scopes.set([...sc]);
  }

  toggleScanner(): void {
    this.materializar();
    const sc = new Set(this.scopes());
    if (sc.has('scanner:use')) sc.delete('scanner:use');
    else sc.add('scanner:use');
    this.scopes.set([...sc]);
  }

  agregarManual(): void {
    const v = this.scopeManual().trim();
    if (!v) return;
    const sc = new Set(this.scopes());
    sc.add(v);
    this.scopes.set([...sc]);
    this.scopeManual.set('');
  }

  quitarScope(scope: string): void {
    this.scopes.set(this.scopes().filter((s) => s !== scope));
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nombre_rol, descripcion, estado } = this.form.getRawValue();
    const permisos = { scopes: this.scopes() };

    if (this.isEdit()) {
      this.save.emit({ nombre_rol, descripcion: descripcion || undefined, permisos, estado });
    } else {
      this.save.emit({ nombre_rol, descripcion: descripcion || undefined, permisos });
    }
  }
}
