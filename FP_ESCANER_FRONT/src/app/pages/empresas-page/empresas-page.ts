import { Component, inject, signal } from '@angular/core';

import { EmpresaForm } from '../../components/empresa-form/empresa-form';
import { Empresa, EmpresaCreate, EmpresaUpdate } from '../../core/interfaces/empresa';
import { EmpresaService } from '../../service/empresa';

@Component({
  selector: 'app-empresas-page',
  imports: [EmpresaForm],
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

  editar(e: Empresa): void {
    this.selected.set(e);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
  }

  guardar(payload: EmpresaCreate | EmpresaUpdate): void {
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
