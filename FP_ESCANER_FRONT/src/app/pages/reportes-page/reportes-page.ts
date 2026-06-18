import { Component, computed, inject, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faClipboardCheck,
  faFileCsv,
  faFileExcel,
  faTriangleExclamation,
  faUsers,
  faUserSecret,
} from '@fortawesome/free-solid-svg-icons';

import { Trabajador } from '../../core/interfaces/trabajador';
import { rangoUltimaSemana } from '../../core/utils/fechas';
import { AsistenciaService } from '../../service/asistencia';
import { AuthService } from '../../service/auth';
import { IncidenciaService } from '../../service/incidencia';
import { FormatoReporte, ReporteService, TipoReporte } from '../../service/reporte';
import { TrabajadorService } from '../../service/trabajador';

interface ReporteDef {
  tipo: TipoReporte;
  titulo: string;
  descripcion: string;
  icono: IconDefinition;
  usaFechas: boolean;
  /** Permite filtrar por un trabajador específico. */
  usaTrabajador?: boolean;
  /** Permite filtrar por tipo de incidencia. */
  usaTipo?: boolean;
  columnas: string[];
}

/** Tipos de incidencia para el filtro del reporte (incluye los atajos). */
const TIPOS_INCIDENCIA = [
  'retardo',
  'falta',
  'fuera_de_area',
  'salida_sin_registro',
  'entrada_sin_registro',
  'acceso_otra_empresa',
];

function fmtFechaHora(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

@Component({
  selector: 'app-reportes-page',
  imports: [FaIconComponent],
  templateUrl: './reportes-page.html',
  styleUrl: './reportes-page.scss',
})
export class ReportesPage {
  private readonly reporteService = inject(ReporteService);
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly incidenciaService = inject(IncidenciaService);
  private readonly trabajadorService = inject(TrabajadorService);
  private readonly auth = inject(AuthService);

  readonly iconXlsx = faFileExcel;
  readonly iconCsv = faFileCsv;
  readonly tiposIncidencia = TIPOS_INCIDENCIA;

  /** Trabajadores para el filtro (se cargan si hay permiso). */
  readonly trabajadores = signal<Trabajador[]>([]);

  constructor() {
    this.auth
      .listarSiAlguno(['trabajadores:read', 'reportes:read'], this.trabajadorService.list({ limit: 500 }))
      .subscribe({ next: (data) => this.trabajadores.set(data), error: () => {} });
  }

  readonly reportes: ReporteDef[] = [
    {
      tipo: 'asistencias',
      titulo: 'Asistencias',
      descripcion: 'Registros de entrada/salida en el período.',
      icono: faClipboardCheck,
      usaFechas: true,
      usaTrabajador: true,
      columnas: ['Trabajador', 'Tipo', 'Fecha / hora', 'Estado'],
    },
    {
      tipo: 'incidencias',
      titulo: 'Incidencias',
      descripcion: 'Incidencias registradas en el período.',
      icono: faTriangleExclamation,
      usaFechas: true,
      usaTrabajador: true,
      usaTipo: true,
      columnas: ['Trabajador', 'Tipo', 'Fecha / hora', 'Estado'],
    },
    {
      tipo: 'intentos',
      titulo: 'Intentos de acceso',
      descripcion: 'Intentos (desconocidos, spoofing, fuera de área…).',
      icono: faUserSecret,
      usaFechas: true,
      columnas: ['Persona', 'Tipo', 'Fecha / hora', 'Similitud'],
    },
    {
      tipo: 'trabajadores',
      titulo: 'Padrón de trabajadores',
      descripcion: 'Listado de trabajadores y su rostro registrado.',
      icono: faUsers,
      usaFechas: false,
      columnas: ['Nombre', 'Apellido', 'Estado', 'Rostro'],
    },
  ];

  /** Reporte abierto en el modal (null = cerrado). */
  readonly reporteSel = signal<ReporteDef | null>(null);
  private readonly rango = rangoUltimaSemana();
  readonly fechaInicio = signal(this.rango.inicio);
  readonly fechaFin = signal(this.rango.fin);
  /** Filtros opcionales: trabajador (0 = todos) y tipo de incidencia ('' = todos). */
  readonly idTrabajador = signal(0);
  readonly tipoIncidencia = signal('');
  /** Buscador de trabajador (por ID o nombre) con resultados en vivo. */
  readonly busquedaTrab = signal('');
  readonly mostrarResTrab = signal(false);
  readonly resultadosTrab = computed(() => {
    const q = this.busquedaTrab().trim().toLowerCase();
    if (!q) return [];
    return this.trabajadores()
      .filter((t) => {
        const nombre = `${t.nombre} ${t.apellido}`.toLowerCase();
        return String(t.id_trabajador).includes(q) || nombre.includes(q);
      })
      .slice(0, 8);
  });

  /** Filas de la vista previa (ya formateadas como texto). */
  readonly preview = signal<string[][]>([]);
  readonly cargandoPreview = signal(false);
  readonly previewError = signal<string | null>(null);
  /** Formato que se está descargando ('' = ninguno). */
  readonly descargando = signal<FormatoReporte | ''>('');

  /** Límite de filas de la vista previa (la descarga trae todo). */
  readonly LIMITE_PREVIEW = 100;

  abrir(def: ReporteDef): void {
    this.reporteSel.set(def);
    this.descargando.set('');
    this.idTrabajador.set(0);
    this.tipoIncidencia.set('');
    this.busquedaTrab.set('');
    this.mostrarResTrab.set(false);
    this.cargarPreview();
  }

  cerrar(): void {
    this.reporteSel.set(null);
    this.preview.set([]);
    this.previewError.set(null);
  }

  onFechaInicio(e: Event): void {
    this.fechaInicio.set((e.target as HTMLInputElement).value);
    this.cargarPreview();
  }

  onFechaFin(e: Event): void {
    this.fechaFin.set((e.target as HTMLInputElement).value);
    this.cargarPreview();
  }

  onBuscarTrab(e: Event): void {
    this.busquedaTrab.set((e.target as HTMLInputElement).value);
    this.mostrarResTrab.set(true);
    // No recarga el preview hasta elegir un resultado (evita fetch por tecla).
  }

  elegirTrab(t: Trabajador): void {
    this.idTrabajador.set(t.id_trabajador);
    this.busquedaTrab.set(`#${t.id_trabajador} · ${t.nombre} ${t.apellido}`);
    this.mostrarResTrab.set(false);
    this.cargarPreview();
  }

  limpiarTrab(): void {
    this.idTrabajador.set(0);
    this.busquedaTrab.set('');
    this.mostrarResTrab.set(false);
    this.cargarPreview();
  }

  onTipoIncidencia(e: Event): void {
    this.tipoIncidencia.set((e.target as HTMLSelectElement).value);
    this.cargarPreview();
  }

  private cargarPreview(): void {
    const def = this.reporteSel();
    if (!def) return;
    this.cargandoPreview.set(true);
    this.previewError.set(null);
    const fechas = { fechaInicio: this.fechaInicio(), fechaFin: this.fechaFin() };
    const limit = this.LIMITE_PREVIEW;

    const idTrab = this.idTrabajador();
    const tipoInc = this.tipoIncidencia();

    const ok = (filas: string[][]) => {
      this.preview.set(filas);
      this.cargandoPreview.set(false);
    };
    const fail = () => {
      this.preview.set([]);
      this.previewError.set('No se pudo cargar la vista previa.');
      this.cargandoPreview.set(false);
    };

    switch (def.tipo) {
      case 'asistencias':
        this.asistenciaService.list({ ...fechas, limit }).subscribe({
          next: (a) =>
            ok(
              a
                .filter((x) => !idTrab || x.id_trabajador === idTrab)
                .map((x) => [
                  x.trabajador_nombre ?? `#${x.id_trabajador}`,
                  x.tipo_registro,
                  fmtFechaHora(x.fecha_hora),
                  x.estado_registro,
                ]),
            ),
          error: fail,
        });
        break;
      case 'incidencias':
        this.incidenciaService.combinado({ ...fechas, origen: 'incidencia', limit }).subscribe({
          next: (e) =>
            ok(
              e
                .filter((x) => !idTrab || x.id_trabajador === idTrab)
                .filter((x) => !tipoInc || x.tipo === tipoInc)
                .map((x) => [
                  x.trabajador_nombre ?? 'Desconocido',
                  x.tipo,
                  fmtFechaHora(x.fecha_hora),
                  x.estado ?? '—',
                ]),
            ),
          error: fail,
        });
        break;
      case 'intentos':
        this.incidenciaService.combinado({ ...fechas, origen: 'intento', limit }).subscribe({
          next: (e) =>
            ok(
              e.map((x) => [
                x.trabajador_nombre ?? 'Desconocido',
                x.tipo,
                fmtFechaHora(x.fecha_hora),
                x.similitud != null ? `${Math.round(x.similitud * 100)}%` : '—',
              ]),
            ),
          error: fail,
        });
        break;
      case 'trabajadores':
        this.trabajadorService.list({ limit }).subscribe({
          next: (t) =>
            ok(t.map((x) => [x.nombre, x.apellido, x.estado, x.tiene_embedding ? 'Sí' : 'No'])),
          error: fail,
        });
        break;
    }
  }

  descargar(formato: FormatoReporte): void {
    const def = this.reporteSel();
    if (!def) return;
    this.descargando.set(formato);
    const opts: {
      fechaInicio?: string;
      fechaFin?: string;
      idTrabajador?: number;
      tipoIncidencia?: string;
    } = {};
    if (def.usaFechas) {
      opts.fechaInicio = this.fechaInicio();
      opts.fechaFin = this.fechaFin();
    }
    if (def.usaTrabajador && this.idTrabajador()) opts.idTrabajador = this.idTrabajador();
    if (def.usaTipo && this.tipoIncidencia()) opts.tipoIncidencia = this.tipoIncidencia();
    this.reporteService.descargar(def.tipo, formato, opts).subscribe({
      next: (blob) => {
        this.reporteService.guardar(blob, `${def.tipo}.${formato}`);
        this.descargando.set('');
      },
      error: () => {
        this.previewError.set('No se pudo generar el reporte.');
        this.descargando.set('');
      },
    });
  }
}
