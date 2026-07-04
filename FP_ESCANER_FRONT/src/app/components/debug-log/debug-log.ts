import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { LogService } from '../../core/log.service';
import { AuthService } from '../../service/auth';

/**
 * Panel de log en vivo anclado abajo (sobre el footer), colapsable.
 * Muestra rutas, HTTP (url+status) y eventos. Solo para diagnóstico (APK y web).
 * Solo se muestra al super-admin y cuando él lo activa (Configuración → Depuración).
 */
@Component({
  selector: 'app-debug-log',
  standalone: true,
  template: `
    @if (visible()) {
    <div class="dl" [class.abierto]="abierto()">
      <div class="dl-bar" (click)="abierto.set(!abierto())">
        <span class="dl-titulo">🐞 log <b>{{ log.entradas().length }}</b></span>
        @if (abierto()) {
          <button class="dl-btn" (click)="limpiar($event)">limpiar</button>
        }
        <span class="dl-flecha">{{ abierto() ? '▼' : '▲' }}</span>
      </div>
      @if (abierto()) {
        <div class="dl-cuerpo" #cuerpo>
          @for (e of log.entradas(); track $index) {
            <div class="dl-linea" [attr.data-lvl]="e.level">
              <span class="dl-hora">{{ e.hora }}</span> {{ e.msg }}
            </div>
          } @empty {
            <div class="dl-linea vacio">(sin actividad aún)</div>
          }
        </div>
      }
    </div>
    }
  `,
  styles: [`
    .dl {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
      font-family: ui-monospace, Menlo, Consolas, monospace; color: #e5e7eb;
      pointer-events: none;
    }
    .dl-bar {
      pointer-events: auto; display: flex; align-items: center; gap: 8px;
      background: #111827; border-top: 1px solid #374151; cursor: pointer;
      padding: 4px 10px calc(4px + env(safe-area-inset-bottom, 0px)); font-size: 11px;
    }
    .dl.abierto .dl-bar { padding-bottom: 4px; }
    .dl-titulo { flex: 1; } .dl-titulo b { color: #fbbf24; }
    .dl-flecha { color: #9ca3af; }
    .dl-btn {
      background: #374151; color: #e5e7eb; border: 0; border-radius: 4px;
      padding: 2px 8px; font-size: 11px; cursor: pointer;
    }
    .dl-cuerpo {
      pointer-events: auto; max-height: 45vh; overflow-y: auto; background: #0b1220;
      padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
      font-size: 11px; line-height: 1.45;
    }
    .dl-linea {
      white-space: pre-wrap; word-break: break-all; padding: 1px 0;
      border-bottom: 1px solid rgba(255,255,255,.04);
    }
    .dl-hora { color: #6b7280; }
    .dl-linea[data-lvl="net"]   { color: #93c5fd; }
    .dl-linea[data-lvl="ok"]    { color: #86efac; }
    .dl-linea[data-lvl="warn"]  { color: #fcd34d; }
    .dl-linea[data-lvl="error"] { color: #fca5a5; }
    .dl-linea.vacio { color: #6b7280; }
  `],
})
export class DebugLog {
  readonly log = inject(LogService);
  private readonly auth = inject(AuthService);
  /** Solo super-admin y solo si él activó los logs (Configuración → Depuración). */
  readonly visible = computed(() => this.auth.esAdmin() && this.log.activo());
  readonly abierto = signal(false);
  private readonly cuerpo = viewChild<ElementRef<HTMLDivElement>>('cuerpo');

  constructor() {
    // Auto-scroll al fondo cuando llegan líneas nuevas (y el panel está abierto).
    effect(() => {
      this.log.entradas(); // dependencia reactiva
      const el = this.cuerpo()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  limpiar(ev: Event): void {
    ev.stopPropagation();
    this.log.clear();
  }
}
