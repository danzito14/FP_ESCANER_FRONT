import { Component, computed, inject, signal } from '@angular/core';

import { MapFeature, MapView } from '../../components/map-view/map-view';
import { PuertaForm } from '../../components/puerta-form/puerta-form';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { Dispositivo } from '../../core/interfaces/dispositivo';
import { Empresa } from '../../core/interfaces/empresa';
import {
  PuertaAcceso,
  PuertaAccesoCreate,
  PuertaAccesoUpdate,
} from '../../core/interfaces/puerta-acceso';
import { pointToWkt } from '../../core/utils/geo';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { DispositivoService } from '../../service/dispositivo';
import { EmpresaService } from '../../service/empresa';
import { PuertaAccesoService } from '../../service/puerta-acceso';

@Component({
  selector: 'app-puertas-page',
  imports: [PuertaForm, MapView],
  templateUrl: './puertas-page.html',
  styleUrl: './puertas-page.scss',
})
export class PuertasPage {
  private readonly service = inject(PuertaAccesoService);
  private readonly areaService = inject(AreaTrabajoService);
  private readonly empresaService = inject(EmpresaService);
  private readonly dispositivoService = inject(DispositivoService);

  readonly items = signal<PuertaAcceso[]>([]);
  readonly areas = signal<AreaTrabajo[]>([]);
  readonly empresas = signal<Empresa[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<PuertaAcceso | null>(null);
  readonly mapSelId = signal<number | null>(null);

  readonly mapFeatures = computed<MapFeature[]>(() =>
    this.items().map((p) => ({
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
    this.areaService.list().subscribe({
      next: (data) => this.areas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.empresaService.list().subscribe({
      next: (data) => this.empresas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.dispositivoService.list().subscribe({
      next: (data) => this.dispositivos.set(data),
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
