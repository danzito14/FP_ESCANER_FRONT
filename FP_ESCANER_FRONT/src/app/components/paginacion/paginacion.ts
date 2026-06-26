import { Component, computed, input, model } from '@angular/core';

/** Tamaño de página por defecto (filas por vista). */
export const TAM_PAGINA = 25;

/** Una entrada de la barra: un número de página (`gap=false`) o unos puntos `…` (`gap=true`). */
interface PaginaItem {
  gap: boolean;
  valor: number;
}

/**
 * Paginación client-side reutilizable. El padre le pasa el total de filas
 * filtradas y enlaza `pagina`; muestra Anterior/Siguiente, botones numerados
 * (con ventana deslizante y `…` para listas largas, ej. 600 páginas) y
 * "Página X de Y". Se oculta si no hay filas.
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

        <div class="paginacion-nums">
          @for (it of paginas(); track $index) {
            @if (it.gap) {
              <span class="paginacion-gap">…</span>
            } @else {
              <button
                type="button"
                class="btn btn-sm paginacion-num"
                [class.is-active]="it.valor === paginaActual()"
                [attr.aria-current]="it.valor === paginaActual() ? 'page' : null"
                (click)="irA(it.valor)"
              >
                {{ it.valor }}
              </button>
            }
          }
        </div>

        <button
          type="button"
          class="btn btn-sm"
          [disabled]="paginaActual() >= totalPaginas()"
          (click)="siguiente()"
        >
          Siguiente ›
        </button>
      </nav>

      <p class="paginacion-info">
        Página {{ paginaActual() }} de {{ totalPaginas() }}
        <small>· {{ total() }} registros</small>
      </p>
    }
  `,
  styles: `
    .paginacion {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .paginacion-nums {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .paginacion-num {
      min-width: 2.1rem;
    }
    .paginacion-num.is-active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
      box-shadow: 0 4px 12px rgba(36, 86, 64, 0.28);
    }
    .paginacion-num.is-active:hover {
      background: var(--accent-hover);
    }
    .paginacion-gap {
      padding: 0 0.2rem;
      color: var(--text-muted);
      user-select: none;
    }
    .paginacion-info {
      text-align: center;
      margin-top: 0.5rem;
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

  /**
   * Números a mostrar como botones: siempre la 1ª y la última, una ventana de
   * ±2 alrededor de la actual, y `…` donde haya saltos. Ej. (actual 6 de 600):
   * 1 … 4 5 6 7 8 … 600.
   */
  readonly paginas = computed<PaginaItem[]>(() => {
    const tp = this.totalPaginas();
    const p = this.paginaActual();
    const delta = 2;
    const out: PaginaItem[] = [];
    const inicio = Math.max(2, p - delta);
    const fin = Math.min(tp - 1, p + delta);

    out.push({ gap: false, valor: 1 });
    if (inicio > 2) out.push({ gap: true, valor: 0 });
    for (let i = inicio; i <= fin; i++) out.push({ gap: false, valor: i });
    if (fin < tp - 1) out.push({ gap: true, valor: 0 });
    if (tp > 1) out.push({ gap: false, valor: tp });
    return out;
  });

  irA(p: number): void {
    this.pagina.set(Math.min(this.totalPaginas(), Math.max(1, p)));
  }

  anterior(): void {
    this.pagina.set(Math.max(1, this.paginaActual() - 1));
  }

  siguiente(): void {
    this.pagina.set(Math.min(this.totalPaginas(), this.paginaActual() + 1));
  }
}
