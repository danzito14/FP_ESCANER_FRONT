import { Component, computed, inject, signal } from '@angular/core';

import { AreaForm } from '../../components/area-form/area-form';
import { MapFeature, MapView } from '../../components/map-view/map-view';
import {
  AreaTrabajo,
  AreaTrabajoCreate,
  AreaTrabajoUpdate,
} from '../../core/interfaces/area-trabajo';
import { Empresa } from '../../core/interfaces/empresa';
import { lngLatToWkt } from '../../core/utils/geo';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { EmpresaService } from '../../service/empresa';

@Component({
  selector: 'app-areas-page',
  imports: [AreaForm, MapView],
  templateUrl: './areas-page.html',
  styleUrl: './areas-page.scss',
})
export class AreasPage {
  private readonly service = inject(AreaTrabajoService);
  private readonly empresaService = inject(EmpresaService);

  readonly items = signal<AreaTrabajo[]>([]);
  readonly empresas = signal<Empresa[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<AreaTrabajo | null>(null);
  readonly mapSelId = signal<number | null>(null);

  readonly mapFeatures = computed<MapFeature[]>(() =>
    this.items().map((a) => ({
      id: a.id_area,
      wkt: a.ubicacion ?? lngLatToWkt(a.coordenadas),
      label: a.nombre_area,
      // Azul si el área pertenece a una empresa; gris si no.
      color: a.id_empresa ? '#3b82f6' : '#9099a5',
    })),
  );

  constructor() {
    this.empresaService.list().subscribe({
      next: (data) => this.empresas.set(data),
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

  empresaNombre(id: number | null | undefined): string {
    if (!id) return '—';
    return this.empresas().find((e) => e.id_empresa === id)?.nombre_empresa ?? `#${id}`;
  }

  nuevo(): void {
    this.selected.set(null);
    this.showForm.set(true);
  }

  editar(a: AreaTrabajo): void {
    this.selected.set(a);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
  }

  guardar(payload: AreaTrabajoCreate | AreaTrabajoUpdate): void {
    const sel = this.selected();
    const req = sel
      ? this.service.update(sel.id_area, payload)
      : this.service.create(payload as AreaTrabajoCreate);

    req.subscribe({
      next: () => {
        this.cerrar();
        this.load();
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  eliminar(a: AreaTrabajo): void {
    if (!confirm(`¿Desactivar el área "${a.nombre_area}"?`)) return;
    this.service.remove(a.id_area).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
