import { Component, inject, signal } from '@angular/core';

import { EmbeddingCapture } from '../../components/embedding-capture/embedding-capture';
import { TrabajadorForm } from '../../components/trabajador-form/trabajador-form';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import {
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate,
} from '../../core/interfaces/trabajador';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { EmbeddingService } from '../../service/embedding';
import { TrabajadorService } from '../../service/trabajador';

@Component({
  selector: 'app-trabajadores-page',
  imports: [TrabajadorForm, EmbeddingCapture],
  templateUrl: './trabajadores-page.html',
  styleUrl: './trabajadores-page.scss',
})
export class TrabajadoresPage {
  private readonly service = inject(TrabajadorService);
  private readonly areaService = inject(AreaTrabajoService);
  private readonly embeddingService = inject(EmbeddingService);

  readonly items = signal<Trabajador[]>([]);
  readonly areas = signal<AreaTrabajo[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Trabajador | null>(null);
  /** Trabajador en proceso de registro de rostro (muestra el capturador en el modal). */
  readonly enrolling = signal<Trabajador | null>(null);
  readonly enrollModo = signal<'registrar' | 'actualizar'>('registrar');

  constructor() {
    this.areaService.list().subscribe({
      next: (data) => this.areas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list().subscribe({
      next: (data) => {
        this.items.set(data);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(this.msg(e));
        this.loading.set(false);
      },
    });
  }

  areaNombre(id: number): string {
    return this.areas().find((a) => a.id_area === id)?.nombre_area ?? `#${id}`;
  }

  nuevo(): void {
    this.selected.set(null);
    this.showForm.set(true);
  }

  editar(t: Trabajador): void {
    this.selected.set(t);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
    this.enrolling.set(null);
  }

  guardar(payload: TrabajadorCreate | TrabajadorUpdate): void {
    const sel = this.selected();

    if (sel) {
      this.service.update(sel.id_trabajador, payload).subscribe({
        next: () => {
          this.cerrar();
          this.load();
        },
        error: (e) => this.error.set(this.msg(e)),
      });
      return;
    }

    // Alta: tras crear, pasa a registrar el rostro del nuevo trabajador.
    this.service.create(payload as TrabajadorCreate).subscribe({
      next: (creado) => {
        this.load();
        if (creado?.id_trabajador) {
          this.selected.set(null);
          this.enrollModo.set('registrar');
          this.enrolling.set(creado);
        } else {
          this.cerrar();
        }
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  /** Abre el capturador para registrar (nuevo) el rostro de un trabajador. */
  registrarRostro(t: Trabajador): void {
    this.selected.set(null);
    this.enrollModo.set('registrar');
    this.enrolling.set(t);
    this.showForm.set(true);
  }

  /** Abre el capturador para reemplazar (actualizar) el rostro existente. */
  actualizarRostro(t: Trabajador): void {
    this.selected.set(null);
    this.enrollModo.set('actualizar');
    this.enrolling.set(t);
    this.showForm.set(true);
  }

  /** Borra el rostro registrado del trabajador. */
  eliminarRostro(t: Trabajador): void {
    if (!confirm(`¿Eliminar el rostro de "${t.nombre} ${t.apellido}"? No es reversible.`)) return;
    this.embeddingService.eliminarDeTrabajador(t.id_trabajador).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  /** El registro de rostro terminó (o se omitió): cierra y recarga. */
  rostroListo(): void {
    this.cerrar();
    this.load();
  }

  eliminar(t: Trabajador): void {
    if (!confirm(`¿Desactivar a "${t.nombre} ${t.apellido}"?`)) return;
    this.service.remove(t.id_trabajador).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
