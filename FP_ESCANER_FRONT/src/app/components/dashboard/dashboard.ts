import { Component, computed, inject, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faArrowRightToBracket,
  faArrowRightFromBracket,
  faBan,
  faCircleCheck,
  faCircleXmark,
  faClipboardCheck,
  faClock,
  faLocationCrosshairs,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';

import { Asistencia } from '../../core/interfaces/asistencia';
import { Empresa } from '../../core/interfaces/empresa';
import { Incidencia } from '../../core/interfaces/incidencia';
import { alFiltrar } from '../../core/utils/buscar';
import { rangoUltimaSemana } from '../../core/utils/fechas';
import { AsistenciaService } from '../../service/asistencia';
import { AuthService } from '../../service/auth';
import { EmpresaService } from '../../service/empresa';
import { IncidenciaService } from '../../service/incidencia';

/**
 * Panel de inicio: informe general de asistencias e incidencias en un rango
 * (por defecto la última semana). El super-admin puede filtrar por empresa
 * (server-side vía id_empresa); los demás ven solo su empresa (el backend ya
 * los limita).
 */
@Component({
  selector: 'app-dashboard',
  imports: [FaIconComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly incidenciaService = inject(IncidenciaService);
  private readonly empresaService = inject(EmpresaService);

  protected readonly icons = {
    asistencias: faClipboardCheck,
    entrada: faArrowRightToBracket,
    salida: faArrowRightFromBracket,
    exitoso: faCircleCheck,
    rechazado: faCircleXmark,
    fuera: faLocationCrosshairs,
    incidencias: faTriangleExclamation,
    pendiente: faClock,
    cancelado: faBan,
  };

  readonly esAdmin = this.auth.esAdmin;

  readonly asistencias = signal<Asistencia[]>([]);
  readonly incidencias = signal<Incidencia[]>([]);
  readonly empresas = signal<Empresa[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly rango = rangoUltimaSemana();
  readonly fechaInicio = signal(this.rango.inicio);
  readonly fechaFin = signal(this.rango.fin);
  /** 0 = todas las empresas (solo aplica para admin; va como id_empresa al back). */
  readonly filtroEmpresa = signal(0);

  // --- KPIs (los datos ya vienen filtrados por el backend) ---------------

  private contar<T>(arr: T[], pred: (x: T) => boolean): number {
    return arr.reduce((n, x) => (pred(x) ? n + 1 : n), 0);
  }

  readonly kpiAsistencias = computed(() => {
    const a = this.asistencias();
    return {
      total: a.length,
      entradas: this.contar(a, (x) => x.tipo_registro === 'entrada'),
      salidas: this.contar(a, (x) => x.tipo_registro === 'salida'),
      exitosas: this.contar(a, (x) => x.estado_registro === 'exitoso'),
      rechazadas: this.contar(a, (x) => x.estado_registro === 'rechazado'),
      fueraArea: this.contar(a, (x) => x.estado_registro === 'fuera_de_area'),
    };
  });

  readonly kpiIncidencias = computed(() => {
    const i = this.incidencias();
    return {
      total: i.length,
      pendientes: this.contar(i, (x) => x.estado === 'pendiente'),
      revisadas: this.contar(i, (x) => x.estado === 'revisada'),
      justificadas: this.contar(i, (x) => x.estado === 'justificada'),
    };
  });

  constructor() {
    if (this.esAdmin()) {
      this.empresaService.list().subscribe({
        next: (data) => this.empresas.set(data),
        error: (e) => this.error.set(this.msg(e)),
      });
    }
    // Recarga al cambiar rango de fechas o empresa.
    alFiltrar([this.fechaInicio, this.fechaFin, this.filtroEmpresa], () => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const emp = this.filtroEmpresa();
    const opts = {
      fechaInicio: this.fechaInicio(),
      fechaFin: this.fechaFin(),
      idEmpresa: emp || undefined,
      limit: 500,
    };
    let pendientes = 2;
    const done = () => {
      if (--pendientes === 0) this.loading.set(false);
    };
    this.auth.listarSiPuede('asistencias', this.asistenciaService.list(opts)).subscribe({
      next: (data) => {
        this.asistencias.set(data);
        done();
      },
      error: (e) => {
        this.error.set(this.msg(e));
        done();
      },
    });
    this.auth.listarSiPuede('incidencias', this.incidenciaService.list(opts)).subscribe({
      next: (data) => {
        this.incidencias.set(data);
        done();
      },
      error: (e) => {
        this.error.set(this.msg(e));
        done();
      },
    });
  }

  onEmpresa(e: Event): void {
    this.filtroEmpresa.set(+(e.target as HTMLSelectElement).value);
  }

  onFechaInicio(e: Event): void {
    this.fechaInicio.set((e.target as HTMLInputElement).value);
  }

  onFechaFin(e: Event): void {
    this.fechaFin.set((e.target as HTMLInputElement).value);
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
