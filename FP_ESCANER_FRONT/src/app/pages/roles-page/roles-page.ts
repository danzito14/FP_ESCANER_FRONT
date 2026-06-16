import { Component, computed, inject, signal } from '@angular/core';

import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { RolForm } from '../../components/rol-form/rol-form';
import { Rol, RolCreate, RolUpdate } from '../../core/interfaces/rol';
import { incluyeTexto } from '../../core/utils/texto';
import { RolService } from '../../service/rol';
import { PuedeDirective } from '../../core/directives/puede';

@Component({
  selector: 'app-roles-page',
  imports: [RolForm, FiltrosTabla, PuedeDirective],
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

  /** Filtro de estado + búsqueda (client-side; /roles no tiene ?nombre=). */
  readonly itemsFiltrados = computed(() => {
    const estado = this.filtroEstado();
    const q = this.buscar();
    let lista = this.items();
    if (estado) lista = lista.filter((r) => r.estado === estado);
    return lista.filter((r) =>
      incluyeTexto(q, r.nombre_rol, r.descripcion, r.permisos.scopes.join(' ')),
    );
  });

  constructor() {
    this.load();
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
