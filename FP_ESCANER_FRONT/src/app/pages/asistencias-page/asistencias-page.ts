import { Component, inject, signal } from '@angular/core';

import { Asistencia } from '../../core/interfaces/asistencia';
import { Dispositivo } from '../../core/interfaces/dispositivo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { Trabajador } from '../../core/interfaces/trabajador';
import { AsistenciaService } from '../../service/asistencia';
import { DispositivoService } from '../../service/dispositivo';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { TrabajadorService } from '../../service/trabajador';

@Component({
  selector: 'app-asistencias-page',
  imports: [],
  templateUrl: './asistencias-page.html',
  styleUrl: './asistencias-page.scss',
})
export class AsistenciasPage {
  private readonly service = inject(AsistenciaService);
  private readonly trabajadorService = inject(TrabajadorService);
  private readonly dispositivoService = inject(DispositivoService);
  private readonly puertaService = inject(PuertaAccesoService);

  readonly items = signal<Asistencia[]>([]);
  readonly trabajadores = signal<Map<number, Trabajador>>(new Map());
  readonly dispositivos = signal<Map<number, Dispositivo>>(new Map());
  readonly puertas = signal<Map<number, PuertaAcceso>>(new Map());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.trabajadorService.list().subscribe({
      next: (data) =>
        this.trabajadores.set(new Map(data.map((t) => [t.id_trabajador, t]))),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.dispositivoService.list().subscribe({
      next: (data) =>
        this.dispositivos.set(new Map(data.map((d) => [d.id_dispositivo, d]))),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.puertaService.list().subscribe({
      next: (data) => this.puertas.set(new Map(data.map((p) => [p.id_puerta, p]))),
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

  dispositivoNombre(id: number | null | undefined): string {
    if (!id) return '—';
    return this.dispositivos().get(id)?.nombre_dispositivo ?? `#${id}`;
  }

  puertaNombre(id: number): string {
    return this.puertas().get(id)?.nombre_puerta ?? `#${id}`;
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
