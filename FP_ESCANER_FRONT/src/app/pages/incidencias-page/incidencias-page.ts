import { Component, computed, inject, signal } from '@angular/core';

import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { EstadoIncidencia } from '../../core/interfaces/common';
import { Empresa } from '../../core/interfaces/empresa';
import { Incidencia } from '../../core/interfaces/incidencia';
import { Trabajador } from '../../core/interfaces/trabajador';
import { alBuscar } from '../../core/utils/buscar';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { AuthService } from '../../service/auth';
import { EmpresaService } from '../../service/empresa';
import { IncidenciaService } from '../../service/incidencia';
import { TrabajadorService } from '../../service/trabajador';

@Component({
  selector: 'app-incidencias-page',
  imports: [FiltrosTabla],
  templateUrl: './incidencias-page.html',
  styleUrl: './incidencias-page.scss',
})
export class IncidenciasPage {
  private readonly service = inject(IncidenciaService);
  private readonly trabajadorService = inject(TrabajadorService);
  private readonly areaService = inject(AreaTrabajoService);
  private readonly empresaService = inject(EmpresaService);
  private readonly auth = inject(AuthService);

  readonly esAdmin = this.auth.esAdmin;

  readonly items = signal<Incidencia[]>([]);
  readonly trabajadores = signal<Map<number, Trabajador>>(new Map());
  readonly areas = signal<Map<number, AreaTrabajo>>(new Map());
  readonly empresas = signal<Empresa[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly estados: EstadoIncidencia[] = ['pendiente', 'revisada', 'justificada'];

  readonly filtroEmpresa = signal(0);
  readonly filtroArea = signal(0);
  readonly buscar = signal('');

  readonly areasFiltro = computed(() => {
    const emp = this.filtroEmpresa();
    const arr = [...this.areas().values()];
    return emp ? arr.filter((a) => a.id_empresa === emp) : arr;
  });

  readonly itemsFiltrados = computed(() => {
    const emp = this.filtroEmpresa();
    const area = this.filtroArea();
    return this.items().filter((inc) => {
      const idArea = this.trabajadores().get(inc.id_trabajador)?.id_area ?? null;
      if (area) return idArea === area;
      if (emp) {
        const idEmp = idArea != null ? this.areas().get(idArea)?.id_empresa : null;
        return idEmp === emp;
      }
      return true;
    });
  });

  constructor() {
    this.trabajadorService.list().subscribe({
      next: (data) =>
        this.trabajadores.set(new Map(data.map((t) => [t.id_trabajador, t]))),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.areaService.list().subscribe({
      next: (data) => this.areas.set(new Map(data.map((a) => [a.id_area, a]))),
      error: (e) => this.error.set(this.msg(e)),
    });
    if (this.esAdmin()) {
      this.empresaService.list().subscribe({
        next: (data) => this.empresas.set(data),
        error: (e) => this.error.set(this.msg(e)),
      });
    }
    alBuscar(this.buscar, () => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list({ nombre: this.buscar() }).subscribe({
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

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
