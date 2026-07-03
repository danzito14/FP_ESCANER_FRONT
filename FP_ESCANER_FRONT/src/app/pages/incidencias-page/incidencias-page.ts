import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../../core/constants/api';
import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { MapFeature, MapView } from '../../components/map-view/map-view';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { ResolverDesconocido } from '../../components/resolver-desconocido/resolver-desconocido';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { EstadoIncidencia } from '../../core/interfaces/common';
import { EscaneoResponse } from '../../core/interfaces/escaneo';
import { EventoCombinado, OrigenEvento } from '../../core/interfaces/evento-combinado';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { RetardoResponse } from '../../core/interfaces/retardo';
import { alFiltrar } from '../../core/utils/buscar';
import { colorEstado } from '../../core/utils/estado-color';
import { rangoUltimaSemana } from '../../core/utils/fechas';
import { lngLatToWkt, wktToPoint } from '../../core/utils/geo';
import { fechaCortaLocal, fmtMinutosRetardo } from '../../core/utils/retardo';
import { incluyeTexto } from '../../core/utils/texto';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { AuthService } from '../../service/auth';
import { EscaneoService } from '../../service/escaneo';
import { IncidenciaService } from '../../service/incidencia';
import { IntentoService } from '../../service/intento';
import { PuertaAccesoService } from '../../service/puerta-acceso';

@Component({
  selector: 'app-incidencias-page',
  imports: [FiltrosTabla, MapView, DatePipe, DecimalPipe, Paginacion, ResolverDesconocido],
  templateUrl: './incidencias-page.html',
  styleUrl: './incidencias-page.scss',
})
export class IncidenciasPage implements OnDestroy {
  private readonly service = inject(IncidenciaService);
  private readonly intentoService = inject(IntentoService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly escaneoService = inject(EscaneoService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly areaService = inject(AreaTrabajoService);

  /** Puede cambiar el estado de una incidencia o intento. */
  readonly puedeEditar = computed(() => this.auth.puedeEscribir('incidencias'));
  /** Estado real por id de intento (GET /intentos); el combinado lo trae null. */
  readonly estadosIntento = signal<Map<string, EstadoIncidencia>>(new Map());
  /** Retardos del período (GET /incidencias/retardos); no viven en el combinado. */
  readonly retardos = signal<RetardoResponse[]>([]);
  /** Modo tabla de retardos: activo cuando el chip de tipo es 'retardo'. */
  readonly modoRetardos = computed(() => this.filtroTipo() === 'retardo');

  /** Evento seleccionado para ver su foto (modal). */
  readonly eventoSel = signal<EventoCombinado | null>(null);
  readonly fotoUrl = signal<string | null>(null);
  /** Blob de la foto (para asignarlo como rostro al resolver un desconocido). */
  readonly fotoBlob = signal<Blob | null>(null);
  readonly fotoCargando = signal(false);

  /** Escaneo asociado al evento abierto (trae la ubicación registrada). */
  readonly escaneoSel = signal<EscaneoResponse | null>(null);
  readonly escaneoCargando = signal(false);

  /** Catálogos auxiliares (solo para el mapa: derivar y dibujar el área). */
  readonly puertas = signal<Map<number, PuertaAcceso>>(new Map());
  readonly areas = signal<Map<number, AreaTrabajo>>(new Map());

  /**
   * Intenta mostrar el mapa: solo para incidencias 'fuera_de_area' con escaneo
   * asociado (`id_escaneo_ref`) y permiso para leerlo. El contenido (mapa /
   * cargando / sin coordenada) lo resuelve la plantilla según el escaneo traído.
   */
  readonly mostrarMapa = computed(() => {
    const e = this.eventoSel();
    return (
      !!e &&
      e.tipo === 'fuera_de_area' &&
      !!e.id_escaneo_ref &&
      this.auth.puedeLeer('escaneos')
    );
  });

  /** Capas del mapa del escaneo abierto: polígono del área + punto registrado. */
  readonly mapFeatures = computed<MapFeature[]>(() => {
    const esc = this.escaneoSel();
    if (!esc || wktToPoint(esc.ubicacion) === null) return [];

    const features: MapFeature[] = [];
    const area = this.areaDeEscaneo(esc);
    if (area) {
      const wkt = area.ubicacion ?? lngLatToWkt(area.coordenadas);
      if (wkt) {
        features.push({ id: `area-${area.id_area}`, wkt, label: area.nombre_area, color: '#3b82f6' });
      }
    }

    const e = this.eventoSel();
    features.push({
      id: esc.id_escaneo,
      wkt: esc.ubicacion,
      label: e ? `${this.trabajadorNombre(e)} · ${e.tipo}` : 'Ubicación del escaneo',
      color: this.colorEscaneo(esc),
    });
    return features;
  });

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
    'area_incorrecta',
    'spoofing',
    'desconocido',
    'otra_empresa',
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

  /** Conteo por estado (sobre la base; usa el estado real, también de intentos). */
  readonly conteos = computed<Record<string, number>>(() => {
    const base = this.baseFiltrados();
    return {
      pendiente: base.filter((e) => this.estadoDe(e) === 'pendiente').length,
      revisada: base.filter((e) => this.estadoDe(e) === 'revisada').length,
      justificada: base.filter((e) => this.estadoDe(e) === 'justificada').length,
    };
  });

  /** Retardos filtrados por la búsqueda (vienen de su propio endpoint). */
  readonly retardosFiltrados = computed(() => {
    const q = this.buscar();
    return this.retardos().filter((r) =>
      incluyeTexto(q, r.trabajador_nombre, r.id_emp, r.area_nombre),
    );
  });

  /** Conteo por tipo (sobre la base). 'retardo' sale de su propio endpoint. */
  readonly conteosTipo = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const t of this.tipos) acc[t] = 0;
    for (const e of this.baseFiltrados()) acc[e.tipo] = (acc[e.tipo] ?? 0) + 1;
    acc['retardo'] = this.retardosFiltrados().length;
    return acc;
  });

  readonly itemsFiltrados = computed(() => {
    const estado = this.filtroEstado();
    const tipo = this.filtroTipo();
    let base = this.baseFiltrados();
    if (estado) base = base.filter((e) => this.estadoDe(e) === estado);
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

  /** Página actual de la tabla de retardos (misma señal `pagina`). */
  readonly retardosPagina = computed(() => {
    const lista = this.retardosFiltrados();
    const maxPag = Math.max(1, Math.ceil(lista.length / TAM_PAGINA));
    const p = Math.min(this.pagina(), maxPag);
    return lista.slice((p - 1) * TAM_PAGINA, (p - 1) * TAM_PAGINA + TAM_PAGINA);
  });

  constructor() {
    // El rango de fechas se filtra en el backend; el resto (origen/estado/tipo/
    // búsqueda) es client-side sobre la lista combinada.
    // Puertas y áreas son SOLO para el mapa del modal (derivar y dibujar el área
    // de un evento 'fuera_de_area'); se gatean por su propio :read para que un
    // rol sin esos permisos vea la tabla igual (sin 403) y solo pierda el polígono.
    this.cargarAux('puertas', this.puertaService.list(), (data) =>
      this.puertas.set(new Map(data.map((p) => [p.id_puerta, p]))),
    );
    this.cargarAux('areas', this.areaService.list(), (data) =>
      this.areas.set(new Map(data.map((a) => [a.id_area, a]))),
    );
    alFiltrar([this.fechaInicio, this.fechaFin], () => this.load());
    this.load();
  }

  /** Carga un listado auxiliar (para el mapa) si hay permiso; errores silenciosos. */
  private cargarAux<T>(recurso: string, obs: Observable<T[]>, set: (data: T[]) => void): void {
    this.auth.listarSiPuede(recurso, obs).subscribe({
      next: (data) => set(data),
      error: () => {},
    });
  }

  /** Área a la que pertenece el escaneo (vía su puerta). */
  private areaDeEscaneo(esc: EscaneoResponse): AreaTrabajo | null {
    const idArea = this.puertas().get(esc.id_puerta)?.id_area;
    return idArea ? this.areas().get(idArea) ?? null : null;
  }

  /** Color del punto según el `dentro_de_area` que ya calculó el backend. */
  private colorEscaneo(esc: EscaneoResponse): string {
    if (esc.dentro_de_area === true) return '#4ade80';
    if (esc.dentro_de_area === false) return '#ef4444';
    return '#9099a5';
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
    this.cargarEstados();
    this.cargarRetardos();
  }

  /**
   * Retardos del período desde GET /incidencias/retardos (para el contador del chip
   * y la tabla del modo retardos). Silencioso: si falla, quedan en 0 sin romper la vista.
   */
  private cargarRetardos(): void {
    this.service
      .retardos({ fechaInicio: this.fechaInicio(), fechaFin: this.fechaFin(), limit: 500 })
      .subscribe({
        next: (data) => this.retardos.set(data),
        error: () => this.retardos.set([]),
      });
  }

  /** Formateadores del retardo (compartidos, para la plantilla). */
  readonly fechaCorta = fechaCortaLocal;
  readonly fmtMin = fmtMinutosRetardo;

  /**
   * Estado real de cada intento desde GET /intentos (el combinado los trae null).
   * Silencioso: si falla, los intentos quedan sin estado/justificar pero la vista
   * (e incidencias) siguen funcionando.
   */
  private cargarEstados(): void {
    this.intentoService
      .list({ fechaInicio: this.fechaInicio(), fechaFin: this.fechaFin(), limit: 500 })
      .subscribe({
        next: (data) =>
          this.estadosIntento.set(new Map(data.map((i) => [i.id_intento, i.estado]))),
        error: () => this.estadosIntento.set(new Map()),
      });
  }

  /** Estado del evento: el de la incidencia o, para intentos, el de GET /intentos. */
  estadoDe(e: EventoCombinado): EstadoIncidencia | null {
    if (e.origen === 'incidencia') return e.estado;
    return this.estadosIntento().get(e.id) ?? null;
  }

  trabajadorNombre(e: EventoCombinado): string {
    return e.trabajador_nombre ?? 'Desconocido';
  }

  onOrigen(ev: Event): void {
    this.filtroOrigen.set((ev.target as HTMLSelectElement).value as '' | OrigenEvento);
  }

  /**
   * ¿Se puede cambiar el estado de este evento? No para spoofing/fuera_de_area
   * (por ahora) ni para los ya justificados (irreversible), y requiere permiso.
   */
  editable(e: EventoCombinado): boolean {
    if (!this.puedeEditar()) return false;
    if (e.tipo === 'spoofing' || e.tipo === 'fuera_de_area') return false;
    return this.estadoDe(e) !== 'justificada';
  }

  /** Cambia el estado: PUT /incidencias/{id} o PUT /intentos/{id} según el origen. */
  cambiarEstado(e: EventoCombinado, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const estado = select.value as EstadoIncidencia;
    const actual = this.estadoDe(e);
    if (estado === actual) return;
    // Justificar es irreversible: confirmar y, si cancela, revertir el select.
    if (
      estado === 'justificada' &&
      !confirm('¿Marcar como justificada? Una vez justificada no se podrá cambiar el estado.')
    ) {
      select.value = actual ?? '';
      return;
    }
    const req: Observable<unknown> =
      e.origen === 'intento'
        ? this.intentoService.update(e.id, { estado })
        : this.service.update(e.id, { estado });
    req.subscribe({
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
    this.cargarEscaneo(e);
    if (!e.tiene_foto) return;
    this.fotoCargando.set(true);
    this.http.get(`${API_URL}${e.foto_url}`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.fotoBlob.set(blob);
        this.fotoUrl.set(URL.createObjectURL(blob));
        this.fotoCargando.set(false);
      },
      error: () => this.fotoCargando.set(false),
    });
  }

  /**
   * Para incidencias 'fuera_de_area' trae el escaneo asociado (su `ubicacion`
   * alimenta el mapa). Silencioso: sin escaneo, sin permiso `escaneos:read` o si
   * la petición falla, no se muestra mapa y el modal queda como cualquier foto.
   */
  private cargarEscaneo(e: EventoCombinado): void {
    this.escaneoSel.set(null);
    this.escaneoCargando.set(false);
    if (e.tipo !== 'fuera_de_area' || !e.id_escaneo_ref || !this.auth.puedeLeer('escaneos')) {
      return;
    }
    this.escaneoCargando.set(true);
    this.escaneoService.getById(e.id_escaneo_ref).subscribe({
      next: (esc) => {
        this.escaneoSel.set(esc);
        this.escaneoCargando.set(false);
      },
      error: () => this.escaneoCargando.set(false),
    });
  }

  cerrarFoto(): void {
    this.revocarFoto();
    this.escaneoSel.set(null);
    this.escaneoCargando.set(false);
    this.eventoSel.set(null);
  }

  /** Un desconocido se resolvió (asistencia/rostro): cierra el modal y recarga. */
  onResuelto(): void {
    this.cerrarFoto();
    this.load();
  }

  /** Libera el object URL anterior para no fugar memoria. */
  private revocarFoto(): void {
    const url = this.fotoUrl();
    if (url) URL.revokeObjectURL(url);
    this.fotoUrl.set(null);
    this.fotoBlob.set(null);
  }

  ngOnDestroy(): void {
    this.revocarFoto();
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
