import { Component, inject, signal } from '@angular/core';

import { TrabajadorForm } from '../../components/trabajador-form/trabajador-form';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import {
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate,
} from '../../core/interfaces/trabajador';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { TrabajadorService } from '../../service/trabajador';

@Component({
  selector: 'app-trabajadores-page',
  imports: [TrabajadorForm],
  templateUrl: './trabajadores-page.html',
  styleUrl: './trabajadores-page.scss',
})
export class TrabajadoresPage {
  private readonly service = inject(TrabajadorService);
  private readonly areaService = inject(AreaTrabajoService);

  readonly items = signal<Trabajador[]>([]);
  readonly areas = signal<AreaTrabajo[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Trabajador | null>(null);

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
  }

  guardar(payload: TrabajadorCreate | TrabajadorUpdate): void {
    const sel = this.selected();
    const req = sel
      ? this.service.update(sel.id_trabajador, payload)
      : this.service.create(payload as TrabajadorCreate);

    req.subscribe({
      next: () => {
        this.cerrar();
        this.load();
      },
      error: (e) => this.error.set(this.msg(e)),
    });
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
