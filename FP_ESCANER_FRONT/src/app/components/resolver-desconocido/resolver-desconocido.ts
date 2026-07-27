import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Observable, of, switchMap } from 'rxjs';

import { AsistenciaManualCreate } from '../../core/interfaces/asistencia';
import { TipoRegistro } from '../../core/interfaces/common';
import { EventoCombinado } from '../../core/interfaces/evento-combinado';
import { Trabajador } from '../../core/interfaces/trabajador';
import { alBuscar, esNumerico } from '../../core/utils/buscar';
import { AsistenciaService } from '../../service/asistencia';
import { AuthService } from '../../service/auth';
import { EmbeddingService } from '../../service/embedding';
import { IntentoService } from '../../service/intento';
import { TrabajadorService } from '../../service/trabajador';

type Flujo = null | 'rostro' | 'conozco';

/**
 * Resuelve un intento de "rostro desconocido" asignándolo a un trabajador existente
 * (nunca crea trabajadores). Dos flujos, cada uno abre un buscador de trabajador:
 *  - 'rostro': asigna la foto del intento como rostro del trabajador + crea la
 *    asistencia manual (caso: a alguien ya registrado lo detectó como desconocido,
 *    o no tenía rostro).
 *  - 'conozco': solo crea la asistencia manual (el trabajador ya tiene su rostro).
 * En ambos, al final marca el intento como justificada. Los datos de la asistencia
 * (puerta/fecha) salen del propio intento.
 */
@Component({
  selector: 'app-resolver-desconocido',
  imports: [],
  templateUrl: './resolver-desconocido.html',
  styleUrl: './resolver-desconocido.scss',
})
export class ResolverDesconocido {
  private readonly trabajadorService = inject(TrabajadorService);
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly embeddingService = inject(EmbeddingService);
  private readonly intentoService = inject(IntentoService);
  private readonly auth = inject(AuthService);

  /** Intento de rostro desconocido a resolver. */
  readonly evento = input.required<EventoCombinado>();
  /** Foto del intento (para el flujo 'rostro'); null si no se pudo cargar. */
  readonly fotoBlob = input<Blob | null>(null);
  /** Emite al resolver para que el padre recargue y cierre el modal. */
  readonly resuelto = output<void>();

  /**
   * Resolver un desconocido crea la asistencia manual (asistencias:write) Y marca el
   * intento como justificada (PUT /intentos → intentos:write): requiere AMBOS, o el
   * flujo mostraría el formulario y fallaría con 403 en el último paso.
   * Asignar el rostro necesita además trabajadores:write.
   */
  readonly puedeResolver = computed(
    () => this.auth.puedeEscribir('asistencias') && this.auth.puedeEscribir('intentos'),
  );
  readonly puedeRostro = computed(() => this.auth.puedeEscribir('trabajadores'));

  readonly flujo = signal<Flujo>(null);
  readonly buscar = signal('');
  readonly resultados = signal<Trabajador[]>([]);
  readonly buscando = signal(false);
  readonly seleccionado = signal<Trabajador | null>(null);
  readonly tipoRegistro = signal<TipoRegistro>('entrada');
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    alBuscar(this.buscar, () => this.buscarTrabajadores());
  }

  /** Abre el buscador para el flujo elegido. */
  abrir(flujo: Exclude<Flujo, null>): void {
    this.flujo.set(flujo);
    this.seleccionado.set(null);
    this.buscar.set('');
    this.resultados.set([]);
    this.error.set(null);
  }

  cancelar(): void {
    this.flujo.set(null);
    this.error.set(null);
  }

  seleccionar(t: Trabajador): void {
    this.seleccionado.set(t);
  }

  private buscarTrabajadores(): void {
    const term = this.buscar().trim();
    if (!term) {
      this.resultados.set([]);
      return;
    }
    this.buscando.set(true);
    // Numérico → por nº de empleado (id_emp); si no, por nombre.
    const req = esNumerico(term)
      ? this.trabajadorService.buscarPorId(term, { limit: 20 })
      : this.trabajadorService.list({ nombre: term, limit: 20 });
    req.subscribe({
      next: (data) => {
        this.resultados.set(data);
        this.buscando.set(false);
      },
      error: () => {
        this.resultados.set([]);
        this.buscando.set(false);
      },
    });
  }

  confirmar(): void {
    const t = this.seleccionado();
    const e = this.evento();
    if (!t) {
      this.error.set('Selecciona un trabajador.');
      return;
    }
    if (e.id_puerta == null) {
      this.error.set('El intento no tiene puerta asociada; no se puede crear la asistencia.');
      return;
    }
    const blob = this.fotoBlob();
    if (this.flujo() === 'rostro' && !blob) {
      this.error.set('No se pudo cargar la foto del intento para asignar el rostro.');
      return;
    }

    this.guardando.set(true);
    this.error.set(null);

    const body: AsistenciaManualCreate = {
      id_trabajador: t.id_trabajador,
      id_puerta: e.id_puerta,
      tipo_registro: this.tipoRegistro(),
      fecha_hora: e.fecha_hora ?? null,
      observaciones: "Resuelto desde 'rostro desconocido'",
      id_dispositivo: null,
    };

    // Flujo 'rostro': primero asigna la foto (reemplaza si ya tenía); luego crea la
    // asistencia y, por último, justifica el intento.
    const rostro$: Observable<unknown> =
      this.flujo() === 'rostro' && blob
        ? t.tiene_embedding
          ? this.embeddingService.reemplazarFoto(t.id_trabajador, blob)
          : this.embeddingService.registrarFoto(t.id_trabajador, blob)
        : of(null);

    rostro$
      .pipe(
        switchMap(() => this.asistenciaService.crearManual(body)),
        switchMap(() => this.intentoService.update(e.id, { estado: 'justificada' })),
      )
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.resuelto.emit();
        },
        error: (err) => {
          this.guardando.set(false);
          this.error.set(this.msg(err));
        },
      });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error inesperado.';
  }
}
