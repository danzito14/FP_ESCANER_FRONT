import { Component, inject, signal } from '@angular/core';

import { EstadoIncidencia } from '../../core/interfaces/common';
import { Incidencia } from '../../core/interfaces/incidencia';
import { Trabajador } from '../../core/interfaces/trabajador';
import { IncidenciaService } from '../../service/incidencia';
import { TrabajadorService } from '../../service/trabajador';

@Component({
  selector: 'app-incidencias-page',
  imports: [],
  templateUrl: './incidencias-page.html',
  styleUrl: './incidencias-page.scss',
})
export class IncidenciasPage {
  private readonly service = inject(IncidenciaService);
  private readonly trabajadorService = inject(TrabajadorService);

  readonly items = signal<Incidencia[]>([]);
  readonly trabajadores = signal<Map<number, Trabajador>>(new Map());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly estados: EstadoIncidencia[] = ['pendiente', 'revisada', 'justificada'];

  constructor() {
    this.trabajadorService.list().subscribe({
      next: (data) =>
        this.trabajadores.set(new Map(data.map((t) => [t.id_trabajador, t]))),
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

  trabajadorNombre(id: number): string {
    const t = this.trabajadores().get(id);
    return t ? `${t.nombre} ${t.apellido}` : `#${id}`;
  }

  cambiarEstado(inc: Incidencia, event: Event): void {
    const estado = (event.target as HTMLSelectElement).value as EstadoIncidencia;
    if (estado === inc.estado) return;
    this.service.update(inc.id_incidencia, { estado }).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  eliminar(inc: Incidencia): void {
    if (!confirm(`¿Eliminar la incidencia #${inc.id_incidencia}?`)) return;
    this.service.remove(inc.id_incidencia).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
