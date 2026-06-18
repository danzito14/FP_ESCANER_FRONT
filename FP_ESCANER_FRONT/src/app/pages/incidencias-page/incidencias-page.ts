import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';

import { API_URL } from '../../core/constants/api';
import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { EstadoIncidencia } from '../../core/interfaces/common';
import { EventoCombinado, OrigenEvento } from '../../core/interfaces/evento-combinado';
import { alFiltrar } from '../../core/utils/buscar';
import { colorEstado } from '../../core/utils/estado-color';
import { rangoUltimaSemana } from '../../core/utils/fechas';
import { incluyeTexto } from '../../core/utils/texto';
import { AuthService } from '../../service/auth';
import { IncidenciaService } from '../../service/incidencia';

@Component({
  selector: 'app-incidencias-page',
  imports: [FiltrosTabla, DatePipe, DecimalPipe, Paginacion],
  templateUrl: './incidencias-page.html',
  styleUrl: './incidencias-page.scss',
})
export class IncidenciasPage implements OnDestroy {
  private readonly service = inject(IncidenciaService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  /** Puede cambiar el estado de una incidencia. */
  readonly puedeEditar = computed(() => this.auth.puedeEscribir('incidencias'));

  /** Evento seleccionado para ver su foto (modal). */
  readonly eventoSel = signal<EventoCombinado | null>(null);
  readonly fotoUrl = signal<string | null>(null);
  readonly fotoCargando = signal(false);

  readonly items = signal<EventoCombinado[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly colorEstado = colorEstado;
  /** Estados (solo aplican a incidencias; los intentos no tienen). */
  readonly estados: EstadoIncidencia[] = ['pendiente', 'revisada', 'justificada'];
  /** Tipos de incidencias + de intentos. */
  readonly tipos = [
    'salida_sin_registro',
    'entrada_sin_registro',
    'falta',
    'retardo',
    'fuera_de_area',
    'acceso_otra_empresa',
    'spoofing',
    'desconocido',
  ];

  readonly buscar = signal('');
  private readonly rango = rangoUltimaSemana();
  readonly fechaInicio = signal(this.rango.inicio);
  readonly fechaFin = signal(this.rango.fin);
  readonly filtroEstado = signal('');
  readonly filtroTipo = signal('');
  /** Filtro por origen ('' = ambos). */
  readonly filtroOrigen = signal<'' | OrigenEvento>('');

  /** Eventos filtrados por origen + búsqueda (base para conteos). */
  readonly baseFiltrados = computed(() => {
    const origen = this.filtroOrigen();
    const q = this.buscar();
    return this.items().filter((e) => {
      if (origen && e.origen !== origen) return false;
      return incluyeTexto(q, e.trabajador_nombre, e.descripcion, e.tipo);
    });
  });

  /** Conteo por estado (sobre la base). */
  readonly conteos = computed<Record<string, number>>(() => {
    const base = this.baseFiltrados();
    return {
      pendiente: base.filter((e) => e.estado === 'pendiente').length,
      revisada: base.filter((e) => e.estado === 'revisada').length,
      justificada: base.filter((e) => e.estado === 'justificada').length,
    };
  });

  /** Conteo por tipo (sobre la base). */
  readonly conteosTipo = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const t of this.tipos) acc[t] = 0;
    for (const e of this.baseFiltrados()) acc[e.tipo] = (acc[e.tipo] ?? 0) + 1;
    return acc;
  });

  readonly itemsFiltrados = computed(() => {
    const estado = this.filtroEstado();
    const tipo = this.filtroTipo();
    let base = this.baseFiltrados();
    if (estado) base = base.filter((e) => e.estado === estado);
    if (tipo) base = base.filter((e) => e.tipo === tipo);
    return base;
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
    // El rango de fechas se filtra en el backend; el resto (origen/estado/tipo/
    // búsqueda) es client-side sobre la lista combinada.
    alFiltrar([this.fechaInicio, this.fechaFin], () => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .combinado({ fechaInicio: this.fechaInicio(), fechaFin: this.fechaFin() })
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

  onOrigen(ev: Event): void {
    this.filtroOrigen.set((ev.target as HTMLSelectElement).value as '' | OrigenEvento);
  }

  /** Solo las incidencias (no los intentos) tienen estado editable. */
  cambiarEstado(e: EventoCombinado, event: Event): void {
    if (e.origen !== 'incidencia') return;
    const estado = (event.target as HTMLSelectElement).value as EstadoIncidencia;
    if (estado === e.estado) return;
    this.service.update(e.id, { estado }).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(this.msg(err)),
    });
  }

  /**
   * Abre el modal y trae la foto como blob (el interceptor agrega el token).
   * `foto_url` ya apunta al endpoint correcto (incidencias o intentos).
   */
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
