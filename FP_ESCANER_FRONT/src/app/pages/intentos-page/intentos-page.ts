import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';

import { API_URL } from '../../core/constants/api';
import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { EventoCombinado } from '../../core/interfaces/evento-combinado';
import { alFiltrar } from '../../core/utils/buscar';
import { colorEstado } from '../../core/utils/estado-color';
import { rangoUltimaSemana } from '../../core/utils/fechas';
import { incluyeTexto } from '../../core/utils/texto';
import { IncidenciaService } from '../../service/incidencia';

/**
 * Intentos fallidos (spoofing / desconocido / otra empresa), con foto.
 * Reutiliza GET /incidencias/combinado filtrado a origen='intento' (scope
 * incidencias:read). Vista de solo lectura: los intentos no tienen estado.
 */
@Component({
  selector: 'app-intentos-page',
  imports: [FiltrosTabla, DatePipe, DecimalPipe, Paginacion],
  templateUrl: './intentos-page.html',
  styleUrl: './intentos-page.scss',
})
export class IntentosPage implements OnDestroy {
  private readonly service = inject(IncidenciaService);
  private readonly http = inject(HttpClient);

  /** Intento seleccionado para ver su foto (modal). */
  readonly eventoSel = signal<EventoCombinado | null>(null);
  readonly fotoUrl = signal<string | null>(null);
  readonly fotoCargando = signal(false);

  readonly items = signal<EventoCombinado[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly colorEstado = colorEstado;
  /** Tipos de intento. */
  readonly tipos = ['spoofing', 'desconocido', 'otra_empresa'];

  readonly buscar = signal('');
  private readonly rango = rangoUltimaSemana();
  readonly fechaInicio = signal(this.rango.inicio);
  readonly fechaFin = signal(this.rango.fin);
  readonly filtroTipo = signal('');

  /** Intentos filtrados por búsqueda (base para conteos). */
  readonly baseFiltrados = computed(() => {
    const q = this.buscar();
    return this.items().filter((e) =>
      incluyeTexto(q, e.trabajador_nombre, e.descripcion, e.tipo),
    );
  });

  /** Conteo por tipo (sobre la base). */
  readonly conteosTipo = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const t of this.tipos) acc[t] = 0;
    for (const e of this.baseFiltrados()) acc[e.tipo] = (acc[e.tipo] ?? 0) + 1;
    return acc;
  });

  readonly itemsFiltrados = computed(() => {
    const tipo = this.filtroTipo();
    const base = this.baseFiltrados();
    return tipo ? base.filter((e) => e.tipo === tipo) : base;
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
    // El rango de fechas se filtra en el backend; búsqueda/tipo es client-side.
    alFiltrar([this.fechaInicio, this.fechaFin], () => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .combinado({ origen: 'intento', fechaInicio: this.fechaInicio(), fechaFin: this.fechaFin() })
      .subscribe({
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

  trabajadorNombre(e: EventoCombinado): string {
    return e.trabajador_nombre ?? 'Desconocido';
  }

  /** Abre el modal y trae la foto como blob (el interceptor agrega el token). */
  verFoto(e: EventoCombinado): void {
    this.eventoSel.set(e);
    this.revocarFoto();
    if (!e.tiene_foto) return;
    this.fotoCargando.set(true);
    this.http.get(`${API_URL}${e.foto_url}`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.fotoUrl.set(URL.createObjectURL(blob));
        this.fotoCargando.set(false);
      },
      error: () => this.fotoCargando.set(false),
    });
  }

  cerrarFoto(): void {
    this.revocarFoto();
    this.eventoSel.set(null);
  }

  /** Libera el object URL anterior para no fugar memoria. */
  private revocarFoto(): void {
    const url = this.fotoUrl();
    if (url) URL.revokeObjectURL(url);
    this.fotoUrl.set(null);
  }

  ngOnDestroy(): void {
    this.revocarFoto();
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
