import { Component, computed, inject, signal } from '@angular/core';

import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { MapFeature, MapView } from '../../components/map-view/map-view';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { PuertaForm } from '../../components/puerta-form/puerta-form';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { Dispositivo } from '../../core/interfaces/dispositivo';
import { Empresa } from '../../core/interfaces/empresa';
import {
  PuertaAcceso,
  PuertaAccesoCreate,
  PuertaAccesoUpdate,
} from '../../core/interfaces/puerta-acceso';
import { alBuscar, esNumerico } from '../../core/utils/buscar';
import { pointToWkt } from '../../core/utils/geo';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { AuthService } from '../../service/auth';
import { DispositivoService } from '../../service/dispositivo';
import { EmpresaService } from '../../service/empresa';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { PuedeDirective } from '../../core/directives/puede';

@Component({
  selector: 'app-puertas-page',
  imports: [PuertaForm, MapView, FiltrosTabla, PuedeDirective, Paginacion],
  templateUrl: './puertas-page.html',
  styleUrl: './puertas-page.scss',
})
export class PuertasPage {
  private readonly service = inject(PuertaAccesoService);
  private readonly areaService = inject(AreaTrabajoService);
  private readonly empresaService = inject(EmpresaService);
  private readonly dispositivoService = inject(DispositivoService);
  private readonly auth = inject(AuthService);

  readonly esAdmin = this.auth.esAdmin;

  readonly items = signal<PuertaAcceso[]>([]);
  readonly areas = signal<AreaTrabajo[]>([]);
  readonly empresas = signal<Empresa[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<PuertaAcceso | null>(null);
  readonly mapSelId = signal<number | null>(null);

  readonly filtroEmpresa = signal(0);
  readonly filtroArea = signal(0);
  readonly filtroEstado = signal('');
  readonly buscar = signal('');
  readonly estados = ['activo', 'inactivo'];

  readonly areasFiltro = computed(() => {
    const emp = this.filtroEmpresa();
    return emp ? this.areas().filter((a) => a.id_empresa === emp) : this.areas();
  });

  readonly itemsFiltrados = computed(() => {
    const emp = this.filtroEmpresa();
    const area = this.filtroArea();
    const estado = this.filtroEstado();
    let lista = this.items();
    if (area) lista = lista.filter((p) => p.id_area === area);
    else if (emp) lista = lista.filter((p) => p.id_empresa === emp);
    if (estado) lista = lista.filter((p) => p.estado === estado);
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
    this.itemsFiltrados().map((p) => ({
      id: p.id_puerta,
      wkt:
        p.ubicacion ??
        (p.latitud != null && p.longitud != null
          ? pointToWkt({ lat: p.latitud, lng: p.longitud })
          : null),
      label: p.nombre_puerta,
      color: '#8b5e34', // café
    })),
  );

  constructor() {
    this.auth.listarSiPuede('areas', this.areaService.list()).subscribe({
      next: (data) => this.areas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.auth.listarSiPuede('empresas', this.empresaService.list()).subscribe({
      next: (data) => this.empresas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.auth.listarSiPuede('dispositivos', this.dispositivoService.list()).subscribe({
      next: (data) => this.dispositivos.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    alBuscar(this.buscar, () => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const term = this.buscar().trim();
    // Solo dígitos → búsqueda por id (server); si no, por nombre.
    const req = esNumerico(term)
      ? this.service.buscarPorId(term)
      : this.service.list({ nombre: term });
    req.subscribe({
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

  empresaNombre(id: number | null | undefined): string {
    if (!id) return '—';
    return this.empresas().find((e) => e.id_empresa === id)?.nombre_empresa ?? `#${id}`;
  }

  dispositivoNombre(id: number | null | undefined): string {
    if (!id) return '—';
    return (
      this.dispositivos().find((d) => d.id_dispositivo === id)?.nombre_dispositivo ??
      `#${id}`
    );
  }

  nuevo(): void {
    this.selected.set(null);
    this.showForm.set(true);
  }

  editar(p: PuertaAcceso): void {
    this.selected.set(p);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
  }

  guardar(payload: PuertaAccesoCreate | PuertaAccesoUpdate): void {
    const sel = this.selected();
    const req = sel
      ? this.service.update(sel.id_puerta, payload)
      : this.service.create(payload as PuertaAccesoCreate);

    req.subscribe({
      next: () => {
        this.cerrar();
        this.load();
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  eliminar(p: PuertaAcceso): void {
    if (!confirm(`¿Desactivar la puerta "${p.nombre_puerta}"?`)) return;
    this.service.remove(p.id_puerta).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
