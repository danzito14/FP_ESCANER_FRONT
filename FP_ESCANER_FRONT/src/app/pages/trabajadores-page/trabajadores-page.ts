import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';

import { EmbeddingCapture } from '../../components/embedding-capture/embedding-capture';
import { EmpSync } from '../../components/emp-sync/emp-sync';
import { FiltrosTabla } from '../../components/filtros-tabla/filtros-tabla';
import { Paginacion, TAM_PAGINA } from '../../components/paginacion/paginacion';
import { TrabajadorForm } from '../../components/trabajador-form/trabajador-form';
import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { Empresa } from '../../core/interfaces/empresa';
import {
  Trabajador,
  TrabajadorCreate,
  TrabajadorUpdate,
} from '../../core/interfaces/trabajador';
import { alBuscar, esNumerico } from '../../core/utils/buscar';
import { AreaTrabajoService } from '../../service/area-trabajo';
import { AuthService } from '../../service/auth';
import { EmbeddingService } from '../../service/embedding';
import { EmpresaService } from '../../service/empresa';
import { TrabajadorService } from '../../service/trabajador';
import { PuedeDirective } from '../../core/directives/puede';

@Component({
  selector: 'app-trabajadores-page',
  imports: [TrabajadorForm, EmbeddingCapture, EmpSync, FiltrosTabla, PuedeDirective, Paginacion],
  templateUrl: './trabajadores-page.html',
  styleUrl: './trabajadores-page.scss',
})
export class TrabajadoresPage {
  private readonly service = inject(TrabajadorService);
  private readonly areaService = inject(AreaTrabajoService);
  private readonly embeddingService = inject(EmbeddingService);
  private readonly empresaService = inject(EmpresaService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly esAdmin = this.auth.esAdmin;

  readonly items = signal<Trabajador[]>([]);
  readonly areas = signal<AreaTrabajo[]>([]);
  readonly empresas = signal<Empresa[]>([]);
  readonly loading = signal(false);
  /** true mientras siguen llegando lotes en segundo plano (tras mostrar el 1º). */
  readonly cargandoMas = signal(false);
  /** Suscripción de la carga por lotes en curso; se cancela al recargar. */
  private cargaSub?: Subscription;
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selected = signal<Trabajador | null>(null);
  /** Trabajador en proceso de registro de rostro (muestra el capturador en el modal). */
  readonly enrolling = signal<Trabajador | null>(null);
  readonly enrollModo = signal<'registrar' | 'actualizar'>('registrar');

  /** Filtros. 0 = todos. */
  readonly filtroEmpresa = signal(0);
  readonly filtroArea = signal(0);
  readonly filtroEstado = signal('');
  readonly buscar = signal('');
  readonly estados = ['activo', 'inactivo', 'suspendido'];

  /** Áreas disponibles en el selector de área, acotadas por la empresa elegida. */
  readonly areasFiltro = computed(() => {
    const emp = this.filtroEmpresa();
    return emp ? this.areas().filter((a) => a.id_empresa === emp) : this.areas();
  });

  /** Trabajadores tras empresa + área + estado (la búsqueda por nombre es server-side). */
  readonly itemsFiltrados = computed(() => {
    const emp = this.filtroEmpresa();
    const area = this.filtroArea();
    const estado = this.filtroEstado();
    let lista = this.items();
    if (area) {
      lista = lista.filter((t) => t.id_area === area);
    } else if (emp) {
      const idsArea = new Set(
        this.areas().filter((a) => a.id_empresa === emp).map((a) => a.id_area),
      );
      lista = lista.filter((t) => idsArea.has(t.id_area));
    }
    if (estado) lista = lista.filter((t) => t.estado === estado);
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
    this.auth.listarSiPuede('areas', this.areaService.list()).subscribe({
      next: (data) => this.areas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    // El formulario necesita las empresas para filtrar áreas (y el filtro admin las usa).
    this.auth.listarSiPuede('empresas', this.empresaService.list()).subscribe({
      next: (data) => this.empresas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    alBuscar(this.buscar, () => this.load());
    this.load();
  }

  load(): void {
    // Cancela una carga por lotes previa (búsqueda nueva, recarga tras editar…).
    this.cargaSub?.unsubscribe();
    this.loading.set(true);
    this.cargandoMas.set(true);
    this.error.set(null);
    const term = this.buscar().trim();
    // Solo dígitos → búsqueda por nº de empleado (id_emp, server); si no, por nombre
    // con la carga progresiva por lotes.
    const fuente = esNumerico(term)
      ? this.service.buscarPorId(term, { limit: 500 })
      : this.service.listAll({ nombre: term });
    this.cargaSub = fuente
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          // Cada lote reemplaza el acumulado; el 1º quita el spinner principal.
          this.items.set(data);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(this.msg(e));
          this.loading.set(false);
          this.cargandoMas.set(false);
        },
        complete: () => this.cargandoMas.set(false),
      });
  }

  areaNombre(id: number): string {
    return this.areas().find((a) => a.id_area === id)?.nombre_area ?? `#${id}`;
  }

  nuevo(): void {
    this.selected.set(null);
    this.showForm.set(true);
  }

  editar(t: Trabajador): void {
    this.selected.set(t);
    this.showForm.set(true);
  }

  cerrar(): void {
    this.showForm.set(false);
    this.selected.set(null);
    this.enrolling.set(null);
  }

  guardar(payload: TrabajadorCreate | TrabajadorUpdate): void {
    const sel = this.selected();

    if (sel) {
      this.service.update(sel.id_trabajador, payload).subscribe({
        next: () => {
          this.cerrar();
          this.load();
        },
        error: (e) => this.error.set(this.msg(e)),
      });
      return;
    }

    // Alta: tras crear, pasa a registrar el rostro del nuevo trabajador.
    this.service.create(payload as TrabajadorCreate).subscribe({
      next: (creado) => {
        this.load();
        if (creado?.id_trabajador) {
          this.selected.set(null);
          this.enrollModo.set('registrar');
          this.enrolling.set(creado);
        } else {
          this.cerrar();
        }
      },
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  /** Abre el capturador para registrar (nuevo) el rostro de un trabajador. */
  registrarRostro(t: Trabajador): void {
    this.selected.set(null);
    this.enrollModo.set('registrar');
    this.enrolling.set(t);
    this.showForm.set(true);
  }

  /** Abre el capturador para reemplazar (actualizar) el rostro existente. */
  actualizarRostro(t: Trabajador): void {
    this.selected.set(null);
    this.enrollModo.set('actualizar');
    this.enrolling.set(t);
    this.showForm.set(true);
  }

  /** Borra el rostro registrado del trabajador. */
  eliminarRostro(t: Trabajador): void {
    if (!confirm(`¿Eliminar el rostro de "${t.nombre} ${t.apellido}"? No es reversible.`)) return;
    this.embeddingService.eliminarDeTrabajador(t.id_trabajador).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  /** El registro de rostro terminó (o se omitió): cierra y recarga. */
  rostroListo(): void {
    this.cerrar();
    this.load();
  }

  eliminar(t: Trabajador): void {
    if (!confirm(`¿Desactivar a "${t.nombre} ${t.apellido}"?`)) return;
    this.service.remove(t.id_trabajador).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
