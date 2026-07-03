import { Component, computed, inject, signal } from '@angular/core';

import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { RolForm } from '../../components/rol-form/rol-form';
import { Rol, RolCreate, RolUpdate } from '../../core/interfaces/rol';
import { alBuscar, esNumerico } from '../../core/utils/buscar';
import { incluyeTexto } from '../../core/utils/texto';
import { RolService } from '../../service/rol';
import { PuedeDirective } from '../../core/directives/puede';

@Component({
  selector: 'app-roles-page',
  imports: [RolForm, FiltrosTabla, PuedeDirective, Paginacion],
  templateUrl: './roles-page.html',
  styleUrl: './roles-page.scss',
})
export class RolesPage {
  private readonly service = inject(RolService);

  readonly items = signal<Rol[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Rol | null>(null);

  readonly filtroEstado = signal('');
  readonly buscar = signal('');
  readonly estados = ['activo', 'inactivo'];

  /**
   * Filtro de estado + búsqueda. Si el término es numérico, la búsqueda por id la
   * hizo el backend (/roles/buscar), así que no se vuelve a filtrar por texto; si es
   * texto, /roles no tiene ?nombre= y se filtra client-side sobre lo cargado.
   */
  readonly itemsFiltrados = computed(() => {
    const estado = this.filtroEstado();
    const q = this.buscar();
    let lista = this.items();
    if (estado) lista = lista.filter((r) => r.estado === estado);
    if (esNumerico(q)) return lista;
    return lista.filter((r) =>
      incluyeTexto(q, r.nombre_rol, r.descripcion, r.permisos.scopes.join(' ')),
    );
  });

  /** Paginación client-side sobre la lista filtrada. */
  readonly pagina = signal(1);
  readonly itemsPagina = computed(() => {
    const lista = this.itemsFiltrados();
    const maxPag = Math.max(1, Math.ceil(lista.length / TAM_PAGINA));
    const p = Math.min(this.pagina(), maxPag);
    return lista.slice((p - 1) * TAM_PAGINA, (p - 1) * TAM_PAGINA + TAM_PAGINA);
  });

  constructor() {
    alBuscar(this.buscar, () => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const term = this.buscar().trim();
    // Solo dígitos → búsqueda por id (server); si no, lista todo y filtra por nombre.
    const req = esNumerico(term) ? this.service.buscarPorId(term) : this.service.list();
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

  editar(r: Rol): void {
    this.selected.set(r);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
  }

  guardar(payload: RolCreate | RolUpdate): void {
    const sel = this.selected();
    const req = sel
      ? this.service.update(sel.id_rol, payload)
      : this.service.create(payload as RolCreate);

    req.subscribe({
      next: () => {
        this.cerrar();
        this.load();
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  eliminar(r: Rol): void {
    if (!confirm(`¿Desactivar el rol "${r.nombre_rol}"?`)) return;
    this.service.remove(r.id_rol).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
