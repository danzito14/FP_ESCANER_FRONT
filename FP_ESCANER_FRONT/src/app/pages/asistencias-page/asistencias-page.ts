import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Observable } from 'rxjs';

import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { MapFeature, MapView } from '../../components/map-view/map-view';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { Asistencia } from '../../core/interfaces/asistencia';
import { Dispositivo } from '../../core/interfaces/dispositivo';
import { Empresa } from '../../core/interfaces/empresa';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { Trabajador } from '../../core/interfaces/trabajador';
import {
  lngLatToCoords,
  lngLatToWkt,
  pointInPolygon,
  wktToCoords,
  wktToPoint,
} from '../../core/utils/geo';
import { alFiltrar } from '../../core/utils/buscar';
import { colorEstado } from '../../core/utils/estado-color';
import { rangoUltimaSemana } from '../../core/utils/fechas';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { AsistenciaService } from '../../service/asistencia';
import { AuthService } from '../../service/auth';
import { DispositivoService } from '../../service/dispositivo';
import { EmpresaService } from '../../service/empresa';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { TrabajadorService } from '../../service/trabajador';

@Component({
  selector: 'app-asistencias-page',
  imports: [MapView, FiltrosTabla, DatePipe, DecimalPipe, Paginacion],
  templateUrl: './asistencias-page.html',
  styleUrl: './asistencias-page.scss',
})
export class AsistenciasPage {
  private readonly service = inject(AsistenciaService);
  private readonly trabajadorService = inject(TrabajadorService);
  private readonly dispositivoService = inject(DispositivoService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly areaService = inject(AreaTrabajoService);
  private readonly empresaService = inject(EmpresaService);
  private readonly auth = inject(AuthService);

  readonly esAdmin = this.auth.esAdmin;

  readonly items = signal<Asistencia[]>([]);
  readonly trabajadores = signal<Map<number, Trabajador>>(new Map());
  readonly dispositivos = signal<Map<number, Dispositivo>>(new Map());
  readonly puertas = signal<Map<number, PuertaAcceso>>(new Map());
  readonly areas = signal<Map<number, AreaTrabajo>>(new Map());
  readonly empresas = signal<Map<number, Empresa>>(new Map());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly mapSelId = signal<number | null>(null);

  readonly colorEstado = colorEstado;
  readonly filtroEmpresa = signal(0);
  readonly filtroArea = signal(0);
  readonly filtroEstado = signal('');
  readonly filtroTipo = signal('');
  readonly buscar = signal('');
  private readonly rango = rangoUltimaSemana();
  readonly fechaInicio = signal(this.rango.inicio);
  readonly fechaFin = signal(this.rango.fin);
  readonly estados = ['exitoso', 'rechazado', 'manual', 'fuera_de_area', 'cancelado'];
  readonly tipos = ['entrada', 'salida'];

  /** Empresas/áreas como arreglo para los selectores. */
  readonly empresasArr = computed(() => [...this.empresas().values()]);
  readonly areasFiltro = computed(() => {
    const emp = this.filtroEmpresa();
    const arr = [...this.areas().values()];
    return emp ? arr.filter((a) => a.id_empresa === emp) : arr;
  });

  /** Asistencias filtradas por empresa/área (base para conteos de estado). */
  readonly baseFiltrados = computed(() => {
    const emp = this.filtroEmpresa();
    const area = this.filtroArea();
    return this.items().filter((a) => {
      if (area) return this.idAreaDe(a) === area;
      if (emp) return this.idEmpresaDe(a) === emp;
      return true;
    });
  });

  /** Conteo por estado_registro (sobre la base). */
  readonly conteos = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const e of this.estados) acc[e] = 0;
    for (const a of this.baseFiltrados()) {
      acc[a.estado_registro] = (acc[a.estado_registro] ?? 0) + 1;
    }
    return acc;
  });

  /** Conteo por tipo_registro (sobre la base). */
  readonly conteosTipo = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const t of this.tipos) acc[t] = 0;
    for (const a of this.baseFiltrados()) acc[a.tipo_registro] = (acc[a.tipo_registro] ?? 0) + 1;
    return acc;
  });

  readonly itemsFiltrados = computed(() => {
    const estado = this.filtroEstado();
    const tipo = this.filtroTipo();
    let base = this.baseFiltrados();
    if (estado) base = base.filter((a) => a.estado_registro === estado);
    if (tipo) base = base.filter((a) => a.tipo_registro === tipo);
    return base;
  });

  /** Paginación client-side sobre la lista filtrada. */
  readonly pagina = signal(1);
  readonly itemsPagina = computed(() => {
    const lista = this.itemsFiltrados();
    const maxPag = Math.max(1, Math.ceil(lista.length / TAM_PAGINA));
    const p = Math.min(this.pagina(), maxPag);
    return lista.slice((p - 1) * TAM_PAGINA, (p - 1) * TAM_PAGINA + TAM_PAGINA);
  });

  readonly mapFeatures = computed<MapFeature[]>(() => {
    const features: MapFeature[] = [];

    // Polígonos de empresas (naranja) — se dibujan al fondo.
    for (const e of this.empresas().values()) {
      const wkt = e.ubicacion ?? lngLatToWkt(e.coordenadas);
      if (wkt) {
        features.push({ id: `empresa-${e.id_empresa}`, wkt, label: e.nombre_empresa, color: '#ff6427' });
      }
    }

    // Polígonos de áreas (azul).
    for (const ar of this.areas().values()) {
      const wkt = ar.ubicacion ?? lngLatToWkt(ar.coordenadas);
      if (wkt) {
        features.push({ id: `area-${ar.id_area}`, wkt, label: ar.nombre_area, color: '#3b82f6' });
      }
    }

    // Puntos de asistencia (verde/rojo) — encima.
    for (const a of this.itemsFiltrados()) {
      features.push({
        id: a.id_asistencia,
        wkt: a.ubicacion,
        label: `${this.trabajadorNombre(a)} · ${a.tipo_registro}`,
        color: this.colorAsistencia(a),
      });
    }

    return features;
  });

  constructor() {
    // La TABLA usa los nombres que ya trae cada registro (trabajador_nombre,
    // empresa_nombre, …), así funciona con solo 'asistencias:read'. Estos
    // listados auxiliares son SOLO para el mapa (polígonos de empresa/área y el
    // color dentro/fuera de área), por eso se gatean por su propio permiso: un
    // rol sin esos :read simplemente no los pide (sin 403) y ve la tabla igual.
    this.cargarAux('trabajadores', this.trabajadorService.list(), (data) =>
      this.trabajadores.set(new Map(data.map((t) => [t.id_trabajador, t]))),
    );
    this.cargarAux('dispositivos', this.dispositivoService.list(), (data) =>
      this.dispositivos.set(new Map(data.map((d) => [d.id_dispositivo, d]))),
    );
    this.cargarAux('puertas', this.puertaService.list(), (data) =>
      this.puertas.set(new Map(data.map((p) => [p.id_puerta, p]))),
    );
    this.cargarAux('areas', this.areaService.list(), (data) =>
      this.areas.set(new Map(data.map((a) => [a.id_area, a]))),
    );
    this.cargarAux('empresas', this.empresaService.list(), (data) =>
      this.empresas.set(new Map(data.map((e) => [e.id_empresa, e]))),
    );
    alFiltrar([this.buscar, this.fechaInicio, this.fechaFin], () => this.load());
    this.load();
  }

  /** Carga un listado auxiliar (para el mapa) si hay permiso; errores silenciosos. */
  private cargarAux<T>(recurso: string, obs: Observable<T[]>, set: (data: T[]) => void): void {
    this.auth.listarSiPuede(recurso, obs).subscribe({
      next: (data) => set(data),
      error: () => {},
    });
  }

  /** Área a la que está designado el registro (vía su puerta o dispositivo). */
  private idAreaDe(a: Asistencia): number | null {
    return (
      this.puertas().get(a.id_puerta)?.id_area ??
      (a.id_dispositivo ? this.dispositivos().get(a.id_dispositivo)?.id_area : null) ??
      null
    );
  }

  /** Verde claro si el punto del registro cae dentro del área; rojo si no. */
  private colorAsistencia(a: Asistencia): string {
    const punto = wktToPoint(a.ubicacion);
    if (!punto) return '#9099a5';
    const idArea = this.idAreaDe(a);
    if (!idArea) return '#9099a5';
    const area = this.areas().get(idArea);
    const ring = area?.ubicacion ? wktToCoords(area.ubicacion) : lngLatToCoords(area?.coordenadas);
    if (!ring.length) return '#9099a5';
    return pointInPolygon(punto, ring) ? '#4ade80' : '#ef4444';
  }

  /** Nombre del área del registro (lo trae el backend; si no, se deduce). */
  areaNombre(a: Asistencia): string {
    if (a.area_nombre) return a.area_nombre;
    const idArea = this.idAreaDe(a);
    if (!idArea) return '—';
    return this.areas().get(idArea)?.nombre_area ?? `#${idArea}`;
  }

  /** Empresa designada del registro (vía el área o la puerta). */
  private idEmpresaDe(a: Asistencia): number | null {
    return (
      this.areas().get(this.idAreaDe(a) ?? -1)?.id_empresa ??
      this.puertas().get(a.id_puerta)?.id_empresa ??
      null
    );
  }

  /** Nombre de la empresa del registro (lo trae el backend; si no, se deduce). */
  empresaNombre(a: Asistencia): string {
    if (a.empresa_nombre) return a.empresa_nombre;
    const idEmpresa = this.idEmpresaDe(a);
    if (!idEmpresa) return '—';
    return this.empresas().get(idEmpresa)?.nombre_empresa ?? `#${idEmpresa}`;
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

  trabajadorNombre(a: Asistencia): string {
    if (a.trabajador_nombre) return a.trabajador_nombre;
    const t = this.trabajadores().get(a.id_trabajador);
    return t ? `${t.nombre} ${t.apellido}` : `#${a.id_trabajador}`;
  }

  dispositivoNombre(a: Asistencia): string {
    if (a.dispositivo_nombre) return a.dispositivo_nombre;
    if (!a.id_dispositivo) return '—';
    return this.dispositivos().get(a.id_dispositivo)?.nombre_dispositivo ?? `#${a.id_dispositivo}`;
  }

  puertaNombre(a: Asistencia): string {
    if (a.puerta_nombre) return a.puerta_nombre;
    return this.puertas().get(a.id_puerta)?.nombre_puerta ?? `#${a.id_puerta}`;
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
