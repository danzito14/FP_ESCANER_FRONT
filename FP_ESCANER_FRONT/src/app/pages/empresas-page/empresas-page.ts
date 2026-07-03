import { Component, computed, inject, signal } from '@angular/core';

import { EmpresaForm } from '../../components/empresa-form/empresa-form';
import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { MapFeature, MapView } from '../../components/map-view/map-view';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { Empresa, EmpresaCreate, EmpresaUpdate } from '../../core/interfaces/empresa';
import { alBuscar, esNumerico } from '../../core/utils/buscar';
import { lngLatToWkt } from '../../core/utils/geo';
import { EmpresaService } from '../../service/empresa';
import { PuedeDirective } from '../../core/directives/puede';

@Component({
  selector: 'app-empresas-page',
  imports: [EmpresaForm, MapView, FiltrosTabla, PuedeDirective, Paginacion],
  templateUrl: './empresas-page.html',
  styleUrl: './empresas-page.scss',
})
export class EmpresasPage {
  private readonly service = inject(EmpresaService);

  readonly items = signal<Empresa[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Empresa | null>(null);
  readonly mapSelId = signal<number | null>(null);
  readonly buscar = signal('');
  readonly filtroEstado = signal('');
  readonly estados = ['activo', 'inactivo'];

  readonly itemsFiltrados = computed(() => {
    const estado = this.filtroEstado();
    const lista = this.items();
    return estado ? lista.filter((e) => e.estado === estado) : lista;
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
    this.itemsFiltrados().map((e) => ({
      id: e.id_empresa,
      wkt: e.ubicacion ?? lngLatToWkt(e.coordenadas),
      label: e.nombre_empresa,
      color: '#245640', // naranja
    })),
  );

  constructor() {
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

  nuevo(): void {
    this.selected.set(null);
    this.showForm.set(true);
  }

  editar(e: Empresa): void {
    this.selected.set(e);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
  }

  guardar(payload: EmpresaCreate | EmpresaUpdate): void {
    console.log(payload);
    const sel = this.selected();
    const req = sel
      ? this.service.update(sel.id_empresa, payload)
      : this.service.create(payload as EmpresaCreate);

    req.subscribe({
      next: () => {
        this.cerrar();
        this.load();
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  eliminar(e: Empresa): void {
    if (!confirm(`¿Desactivar la empresa "${e.nombre_empresa}"?`)) return;
    this.service.remove(e.id_empresa).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(this.msg(err)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
