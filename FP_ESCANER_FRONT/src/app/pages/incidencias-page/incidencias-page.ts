import { Component, computed, inject, signal } from '@angular/core';

import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { EstadoIncidencia } from '../../core/interfaces/common';
import { Empresa } from '../../core/interfaces/empresa';
import { Incidencia } from '../../core/interfaces/incidencia';
import { Trabajador } from '../../core/interfaces/trabajador';
import { alFiltrar } from '../../core/utils/buscar';
import { colorEstado } from '../../core/utils/estado-color';
import { rangoUltimaSemana } from '../../core/utils/fechas';
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
  /** Puede cambiar el estado de una incidencia. */
  readonly puedeEditar = computed(() => this.auth.puedeEscribir('incidencias'));

  readonly items = signal<Incidencia[]>([]);
  readonly trabajadores = signal<Map<number, Trabajador>>(new Map());
  readonly areas = signal<Map<number, AreaTrabajo>>(new Map());
  readonly empresas = signal<Empresa[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly colorEstado = colorEstado;
  readonly estados: EstadoIncidencia[] = ['pendiente', 'revisada', 'justificada'];
  readonly tipos = [
    'salida_sin_registro',
    'entrada_sin_registro',
    'falta',
    'retardo',
    'fuera_de_area',
  ];

  readonly filtroEmpresa = signal(0);
  readonly filtroArea = signal(0);
  readonly buscar = signal('');
  private readonly rango = rangoUltimaSemana();
  readonly fechaInicio = signal(this.rango.inicio);
  readonly fechaFin = signal(this.rango.fin);
  /** Filtro por estado de incidencia ('' = todas). */
  readonly filtroEstado = signal('');
  /** Filtro por tipo de incidencia ('' = todos). */
  readonly filtroTipo = signal('');

  readonly areasFiltro = computed(() => {
    const emp = this.filtroEmpresa();
    const arr = [...this.areas().values()];
    return emp ? arr.filter((a) => a.id_empresa === emp) : arr;
  });

  /** Incidencias filtradas por empresa/área (sin estado), base para conteos. */
  readonly baseFiltrados = computed(() => {
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

  /** Conteo por estado (sobre la base, ignorando el filtro de estado). */
  readonly conteos = computed<Record<string, number>>(() => {
    const base = this.baseFiltrados();
    return {
      pendiente: base.filter((i) => i.estado === 'pendiente').length,
      revisada: base.filter((i) => i.estado === 'revisada').length,
      justificada: base.filter((i) => i.estado === 'justificada').length,
    };
  });

  /** Conteo por tipo de incidencia (sobre la base). */
  readonly conteosTipo = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const t of this.tipos) acc[t] = 0;
    for (const i of this.baseFiltrados()) acc[i.tipo_incidencia] = (acc[i.tipo_incidencia] ?? 0) + 1;
    return acc;
  });

  readonly itemsFiltrados = computed(() => {
    const estado = this.filtroEstado();
    const tipo = this.filtroTipo();
    let base = this.baseFiltrados();
    if (estado) base = base.filter((i) => i.estado === estado);
    if (tipo) base = base.filter((i) => i.tipo_incidencia === tipo);
    return base;
  });

  constructor() {
    // El nombre del trabajador lo trae cada incidencia (trabajador_nombre). Estos
    // listados son respaldo/atribución del filtro admin; se gatean por su propio
    // permiso (un rol sin ellos no los pide y la tabla se muestra igual).
    this.auth.listarSiPuede('trabajadores', this.trabajadorService.list()).subscribe({
      next: (data) =>
        this.trabajadores.set(new Map(data.map((t) => [t.id_trabajador, t]))),
      error: () => {},
    });
    this.auth.listarSiPuede('areas', this.areaService.list()).subscribe({
      next: (data) => this.areas.set(new Map(data.map((a) => [a.id_area, a]))),
      error: () => {},
    });
    if (this.esAdmin()) {
      this.empresaService.list().subscribe({
        next: (data) => this.empresas.set(data),
        error: (e) => this.error.set(this.msg(e)),
      });
    }
    alFiltrar([this.buscar, this.fechaInicio, this.fechaFin], () => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .list({
        nombre: this.buscar(),
        fechaInicio: this.fechaInicio(),
        fechaFin: this.fechaFin(),
      })
      .subscribe({
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

  trabajadorNombre(inc: Incidencia): string {
    if (inc.trabajador_nombre) return inc.trabajador_nombre;
    const t = this.trabajadores().get(inc.id_trabajador);
    return t ? `${t.nombre} ${t.apellido}` : `#${inc.id_trabajador}`;
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
