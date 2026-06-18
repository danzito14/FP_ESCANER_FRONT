import { Component, computed, input, model } from '@angular/core';

/** Tamaño de página por defecto (filas por vista). */
export const TAM_PAGINA = 25;

/**
 * Paginación client-side reutilizable. El padre le pasa el total de filas
 * filtradas y enlaza `pagina`; muestra Anterior/Siguiente y "Página X de Y".
 * Se oculta si solo hay una página.
 */
@Component({
  selector: 'app-paginacion',
  imports: [],
  template: `
    @if (total() > 0) {
      <nav class="paginacion">
        <button type="button" class="btn btn-sm" [disabled]="paginaActual() <= 1" (click)="anterior()">
          ‹ Anterior
        </button>
        <span class="paginacion-info">
          Página {{ paginaActual() }} de {{ totalPaginas() }}
          <small>· {{ total() }} registros</small>
        </span>
        <button
          type="button"
          class="btn btn-sm"
          [disabled]="paginaActual() >= totalPaginas()"
          (click)="siguiente()"
        >
          Siguiente ›
        </button>
      </nav>
    }
  `,
  styles: `
    .paginacion {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .paginacion-info {
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    .paginacion-info small {
      color: var(--text-muted);
    }
  `,
})
export class Paginacion {
  /** Total de filas (ya filtradas) sobre las que se pagina. */
  readonly total = input(0);
  readonly tamano = input(TAM_PAGINA);
  /** Página actual (1-based), enlazada con el padre. */
  readonly pagina = model(1);

  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.total() / this.tamano())));
  /** Página efectiva (acotada al rango válido aunque el padre tenga un valor viejo). */
  readonly paginaActual = computed(() =>
    Math.min(Math.max(1, this.pagina()), this.totalPaginas()),
  );

  anterior(): void {
    this.pagina.set(Math.max(1, this.paginaActual() - 1));
  }

  siguiente(): void {
    this.pagina.set(Math.min(this.totalPaginas(), this.paginaActual() + 1));
  }
}
