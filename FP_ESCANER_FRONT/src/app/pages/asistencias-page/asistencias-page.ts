import { Component, computed, inject, signal } from '@angular/core';

import { MapFeature, MapView } from '../../components/map-view/map-view';
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
import { AreaTrabajoService } from '../../service/area-trabajo';
import { AsistenciaService } from '../../service/asistencia';
import { DispositivoService } from '../../service/dispositivo';
import { EmpresaService } from '../../service/empresa';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { TrabajadorService } from '../../service/trabajador';

@Component({
  selector: 'app-asistencias-page',
  imports: [MapView],
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

  readonly items = signal<Asistencia[]>([]);
  readonly trabajadores = signal<Map<number, Trabajador>>(new Map());
  readonly dispositivos = signal<Map<number, Dispositivo>>(new Map());
  readonly puertas = signal<Map<number, PuertaAcceso>>(new Map());
  readonly areas = signal<Map<number, AreaTrabajo>>(new Map());
  readonly empresas = signal<Map<number, Empresa>>(new Map());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly mapSelId = signal<number | null>(null);

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
    for (const a of this.items()) {
      features.push({
        id: a.id_asistencia,
        wkt: a.ubicacion,
        label: `${this.trabajadorNombre(a.id_trabajador)} · ${a.tipo_registro}`,
        color: this.colorAsistencia(a),
      });
    }

    return features;
  });

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
    this.areaService.list().subscribe({
      next: (data) => this.areas.set(new Map(data.map((a) => [a.id_area, a]))),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.empresaService.list().subscribe({
      next: (data) => this.empresas.set(new Map(data.map((e) => [e.id_empresa, e]))),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.load();
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

  /** Nombre del área designada del registro. */
  areaNombre(a: Asistencia): string {
    const idArea = this.idAreaDe(a);
    if (!idArea) return '—';
    return this.areas().get(idArea)?.nombre_area ?? `#${idArea}`;
  }

  /** Nombre de la empresa designada (vía el área o la puerta). */
  empresaNombre(a: Asistencia): string {
    const idEmpresa =
      this.areas().get(this.idAreaDe(a) ?? -1)?.id_empresa ??
      this.puertas().get(a.id_puerta)?.id_empresa ??
      null;
    if (!idEmpresa) return '—';
    return this.empresas().get(idEmpresa)?.nombre_empresa ?? `#${idEmpresa}`;
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
