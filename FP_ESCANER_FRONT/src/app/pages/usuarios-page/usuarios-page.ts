import { Component, inject, signal } from '@angular/core';

import { UsuarioForm } from '../../components/usuario-form/usuario-form';
import { Rol } from '../../core/interfaces/rol';
import { Usuario, UsuarioCreate, UsuarioUpdate } from '../../core/interfaces/usuario';
import { RolService } from '../../service/rol';
import { UsuarioService } from '../../service/usuario';

@Component({
  selector: 'app-usuarios-page',
  imports: [UsuarioForm],
  templateUrl: './usuarios-page.html',
  styleUrl: './usuarios-page.scss',
})
export class UsuariosPage {
  private readonly service = inject(UsuarioService);
  private readonly rolService = inject(RolService);

  readonly items = signal<Usuario[]>([]);
  readonly roles = signal<Rol[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Usuario | null>(null);

  constructor() {
    this.rolService.list().subscribe({
      next: (data) => this.roles.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
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

  rolNombre(id: number): string {
    return this.roles().find((r) => r.id_rol === id)?.nombre ?? `#${id}`;
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
