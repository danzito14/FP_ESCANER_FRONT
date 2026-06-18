import { Component, computed, inject, signal } from '@angular/core';

import { DispositivoForm } from '../../components/dispositivo-form/dispositivo-form';
import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { MapFeature, MapView } from '../../components/map-view/map-view';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import {
  Dispositivo,
  DispositivoCreate,
  DispositivoUpdate,
} from '../../core/interfaces/dispositivo';
import { Empresa } from '../../core/interfaces/empresa';
import {
  Coordenada,
  lngLatToCoords,
  pointInPolygon,
  pointToWkt,
  wktToCoords,
  wktToPoint,
} from '../../core/utils/geo';
import { alBuscar } from '../../core/utils/buscar';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { AuthService } from '../../service/auth';
import { DispositivoService } from '../../service/dispositivo';
import { EmpresaService } from '../../service/empresa';
import { PuedeDirective } from '../../core/directives/puede';

@Component({
  selector: 'app-dispositivos-page',
  imports: [DispositivoForm, MapView, FiltrosTabla, PuedeDirective, Paginacion],
  templateUrl: './dispositivos-page.html',
  styleUrl: './dispositivos-page.scss',
})
export class DispositivosPage {
  private readonly service = inject(DispositivoService);
  private readonly areaService = inject(AreaTrabajoService);
  private readonly empresaService = inject(EmpresaService);
  private readonly auth = inject(AuthService);

  readonly esAdmin = this.auth.esAdmin;

  readonly items = signal<Dispositivo[]>([]);
  readonly areas = signal<AreaTrabajo[]>([]);
  readonly empresas = signal<Empresa[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Dispositivo | null>(null);
  readonly mapSelId = signal<number | null>(null);

  readonly filtroEmpresa = signal(0);
  readonly filtroArea = signal(0);
  readonly filtroEstado = signal('');
  readonly buscar = signal('');
  readonly estados = ['activo', 'inactivo', 'mantenimiento'];

  readonly areasFiltro = computed(() => {
    const emp = this.filtroEmpresa();
    return emp ? this.areas().filter((a) => a.id_empresa === emp) : this.areas();
  });

  readonly itemsFiltrados = computed(() => {
    const emp = this.filtroEmpresa();
    const area = this.filtroArea();
    const estado = this.filtroEstado();
    let lista = this.items();
    if (area) {
      lista = lista.filter((d) => d.id_area === area);
    } else if (emp) {
      const idsArea = new Set(
        this.areas().filter((a) => a.id_empresa === emp).map((a) => a.id_area),
      );
      lista = lista.filter((d) => d.id_area != null && idsArea.has(d.id_area));
    }
    if (estado) lista = lista.filter((d) => d.estado === estado);
    return lista;
  });

  /** Paginación client-side sobre la lista filtrada. */
  readonly pagina = signal(1);
  readonly itemsPagina = computed(() => {
    const lista = this.itemsFiltrados();
    const maxPag = Math.max(1, Math.ceil(lista.length / TAM_PAGINA));
    const p = Math.min(this.pagina(), maxPag);
    return lista.slice((p - 1) * TAM_PAGINA, (p - 1) * TAM_PAGINA + TAM_PAGINA);
  });

  readonly mapFeatures = computed<MapFeature[]>(() =>
    this.itemsFiltrados().map((d) => ({
      id: d.id_dispositivo,
      wkt: pointToWkt(this.puntoDe(d)),
      label: d.nombre_dispositivo,
      color: this.colorDispositivo(d),
    })),
  );

  /** Punto del dispositivo, ya venga como WKT o como latitud/longitud. */
  private puntoDe(d: Dispositivo): Coordenada | null {
    if (d.ubicacion) return wktToPoint(d.ubicacion);
    if (d.latitud != null && d.longitud != null) return { lat: d.latitud, lng: d.longitud };
    return null;
  }

  /** Anillo del área, ya venga como WKT (POLYGON) o como arreglo de coordenadas. */
  private ringDeArea(a?: AreaTrabajo): Coordenada[] {
    if (!a) return [];
    return a.ubicacion ? wktToCoords(a.ubicacion) : lngLatToCoords(a.coordenadas);
  }

  /** Verde claro si el punto cae dentro de su área; rojo si no; gris si no se puede determinar. */
  private colorDispositivo(d: Dispositivo): string {
    const punto = this.puntoDe(d);
    if (!punto || !d.id_area) return '#9099a5';
    const ring = this.ringDeArea(this.areas().find((a) => a.id_area === d.id_area));
    if (!ring.length) return '#9099a5';
    return pointInPolygon(punto, ring) ? '#4ade80' : '#ef4444';
  }

  constructor() {
    this.auth.listarSiPuede('areas', this.areaService.list()).subscribe({
      next: (data) => this.areas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    // El formulario necesita las empresas para filtrar áreas (y el filtro admin las usa).
    this.auth.listarSiPuede('empresas', this.empresaService.list()).subscribe({
      next: (data) => this.empresas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
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

  areaNombre(id: number | null | undefined): string {
    if (!id) return '—';
    return this.areas().find((a) => a.id_area === id)?.nombre_area ?? `#${id}`;
  }

  nuevo(): void {
    this.selected.set(null);
    this.showForm.set(true);
  }

  editar(d: Dispositivo): void {
    this.selected.set(d);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
  }

  guardar(payload: DispositivoCreate | DispositivoUpdate): void {
    const sel = this.selected();
    const req = sel
      ? this.service.update(sel.id_dispositivo, payload)
      : this.service.create(payload as DispositivoCreate);

    req.subscribe({
      next: () => {
        this.cerrar();
        this.load();
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  eliminar(d: Dispositivo): void {
    if (!confirm(`¿Desactivar el dispositivo "${d.nombre_dispositivo}"?`)) return;
    this.service.remove(d.id_dispositivo).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
