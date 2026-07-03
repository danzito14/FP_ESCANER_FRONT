import { Component, computed, inject, signal } from '@angular/core';

import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { UsuarioForm } from '../../components/usuario-form/usuario-form';
import { Empresa } from '../../core/interfaces/empresa';
import { Rol } from '../../core/interfaces/rol';
import { Usuario, UsuarioCreate, UsuarioUpdate } from '../../core/interfaces/usuario';
import { alBuscar, esNumerico } from '../../core/utils/buscar';
import { AuthService } from '../../service/auth';
import { EmpresaService } from '../../service/empresa';
import { RolService } from '../../service/rol';
import { UsuarioService } from '../../service/usuario';
import { PuedeDirective } from '../../core/directives/puede';

@Component({
  selector: 'app-usuarios-page',
  imports: [UsuarioForm, FiltrosTabla, PuedeDirective, Paginacion],
  templateUrl: './usuarios-page.html',
  styleUrl: './usuarios-page.scss',
})
export class UsuariosPage {
  private readonly service = inject(UsuarioService);
  private readonly rolService = inject(RolService);
  private readonly empresaService = inject(EmpresaService);
  private readonly auth = inject(AuthService);

  readonly esAdmin = this.auth.esAdmin;

  readonly items = signal<Usuario[]>([]);
  readonly roles = signal<Rol[]>([]);
  readonly empresas = signal<Empresa[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Usuario | null>(null);

  readonly filtroEmpresa = signal(0);
  readonly filtroEstado = signal('');
  readonly buscar = signal('');
  readonly estados = ['activo', 'inactivo'];

  readonly itemsFiltrados = computed(() => {
    const emp = this.filtroEmpresa();
    const estado = this.filtroEstado();
    let lista = this.items();
    if (emp) lista = lista.filter((u) => u.empresa === emp);
    if (estado) lista = lista.filter((u) => u.estado === estado);
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

  constructor() {
    this.auth.listarSiPuede('roles', this.rolService.list()).subscribe({
      next: (data) => this.roles.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
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

  rolNombre(id: number): string {
    return this.roles().find((r) => r.id_rol === id)?.nombre_rol ?? `#${id}`;
  }

  empresaNombre(id: number): string {
    return this.empresas().find((e) => e.id_empresa === id)?.nombre_empresa ?? `#${id}`;
  }

  nuevo(): void {
    this.selected.set(null);
    this.showForm.set(true);
  }

  editar(u: Usuario): void {
    this.selected.set(u);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
  }

  guardar(payload: UsuarioCreate | UsuarioUpdate): void {
    const sel = this.selected();
    const req = sel
      ? this.service.update(sel.id_usuario, payload)
      : this.service.create(payload as UsuarioCreate);

    req.subscribe({
      next: () => {
        this.cerrar();
        this.load();
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  eliminar(u: Usuario): void {
    if (!confirm(`¿Desactivar al usuario "${u.nombre_usuario}"?`)) return;
    this.service.remove(u.id_usuario).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
