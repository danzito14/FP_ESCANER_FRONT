import { Component, computed, inject, output, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';

import { TrabajadorService } from '../../service/trabajador';
import { LimpiarDuplicadosResponse } from '../../core/interfaces/trabajador';

/**
 * Limpieza de trabajadores duplicados (SOLO super-admin). Flujo seguro:
 * 1) Simular (dry-run, no borra) → muestra el plan: qué conserva y qué borraría,
 *    avisando de los rostros que se perderían (tiene_embedding).
 * 2) Ejecutar en real → confirm() de por medio (irreversible) → recarga la tabla.
 *    Los que tengan dependencias (FK) se reportan en `no_eliminados` sin abortar.
 * POST /trabajadores/limpiar-duplicados?simular=. Ver [[backend-cloud-pendientes]].
 */
@Component({
  selector: 'app-limpiar-duplicados',
  standalone: true,
  imports: [JsonPipe],
  template: `
    <div class="dup-card">
      <div class="dup-head">
        <strong>Duplicados de trabajadores</strong>
        <small>solo super-admin</small>
        @if (error()) { <span class="dup-msg err">✕ {{ error() }}</span> }
      </div>

      <div class="dup-acciones">
        <button class="btn btn-sm" [disabled]="!!corriendo()" (click)="simular()">
          {{ corriendo() === 'simular' ? 'Simulando…' : 'Simular limpieza' }}
        </button>

        @if (ultimoModo() === 'simular' && hayQueLimpiar()) {
          <button class="btn btn-sm btn-danger" [disabled]="!!corriendo()" (click)="ejecutar()">
            {{ corriendo() === 'ejecutar' ? 'Ejecutando…' : 'Ejecutar limpieza real…' }}
          </button>
        }
      </div>

      @if (resultado(); as r) {
        <p class="dup-resumen" [class.ok]="ultimoModo() === 'ejecutar'">
          {{ ultimoModo() === 'ejecutar' ? 'Limpieza ejecutada.' : 'Simulación (no se borró nada).' }}
          {{ resumen() }}
        </p>

        @if (ultimoModo() === 'simular' && rostrosEnRiesgo() > 0) {
          <div class="dup-alerta riesgo">
            <b>Atención:</b> {{ rostrosEnRiesgo() }} de los que se borrarían <b>tienen rostro registrado</b>:
            ese embedding se perderá. Revísalos abajo (marcados) antes de aplicar.
          </div>
        }

        @if (r.no_eliminados.length) {
          <div class="dup-alerta warn">
            <b>{{ r.no_eliminados.length }} no se pudieron borrar</b> (tienen registros dependientes):
            <ul>
              @for (n of r.no_eliminados; track n.id_trabajador) {
                <li>{{ n.nombre }} {{ n.apellido }} <small>#{{ n.id_trabajador }}</small> — {{ n.motivo }}</li>
              }
            </ul>
          </div>
        }

        @if (r.detalle.length) {
          <div class="dup-grupos">
            @for (g of r.detalle; track g.nombre_clave) {
              <div class="dup-grupo">
                <div class="dup-grupo-tit">{{ g.nombre_clave }}</div>
                <div class="dup-tabla-wrap">
                  <table class="dup-tabla">
                    <thead>
                      <tr><th></th><th>Trabajador</th><th>Nº emp</th><th>Origen</th><th>Empresa</th><th>Rostro</th></tr>
                    </thead>
                    <tbody>
                      <tr class="fila-keep">
                        <td><span class="tag keep">Conserva</span></td>
                        <td>{{ g.conservado.nombre }} {{ g.conservado.apellido }} <small>#{{ g.conservado.id_trabajador }}</small></td>
                        <td>{{ g.conservado.id_emp || '—' }}</td>
                        <td>{{ g.conservado.origen_nomina || '—' }}</td>
                        <td>{{ g.conservado.id_empresa ?? '—' }}</td>
                        <td>{{ g.conservado.tiene_embedding ? '✓' : '—' }}</td>
                      </tr>
                      @for (e of g.eliminados; track e.id_trabajador) {
                        <tr class="fila-del" [class.riesgo]="e.tiene_embedding">
                          <td><span class="tag del">Borra</span></td>
                          <td>{{ e.nombre }} {{ e.apellido }} <small>#{{ e.id_trabajador }}</small></td>
                          <td>{{ e.id_emp || '—' }}</td>
                          <td>{{ e.origen_nomina || '—' }}</td>
                          <td>{{ e.id_empresa ?? '—' }}</td>
                          <td>{{ e.tiene_embedding ? 'sí (se pierde)' : '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="dup-hint">No hay duplicados.</p>
        }

        <button class="btn btn-sm btn-ghost" (click)="verJson.set(!verJson())">
          {{ verJson() ? 'Ocultar JSON' : 'Ver JSON' }}
        </button>
        @if (verJson()) { <pre class="dup-json">{{ r | json }}</pre> }
      }
    </div>
  `,
  styles: [`
    /* El marco de tarjeta lo provee el contenedor .admin-tools de la página. */
    .dup-head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
    .dup-head strong { font-size: 0.95rem; }
    .dup-head small { color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: .03em; }
    .dup-msg.err { color: var(--danger); font-size: 0.82rem; margin-left: auto; }
    .dup-acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; }

    .dup-resumen { margin: 0.8rem 0 0; font-size: 0.88rem; font-weight: 600; }
    .dup-resumen.ok { color: var(--success); }
    .dup-hint { color: var(--text-muted); font-size: 0.85rem; margin: 0.6rem 0 0; }

    .dup-alerta { margin: 0.7rem 0 0; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); font-size: 0.85rem; }
    .dup-alerta.riesgo { background: var(--warning-soft); color: var(--warning); border: 1px solid var(--warning); }
    .dup-alerta.warn { background: var(--danger-soft, rgba(220,38,38,.1)); color: var(--danger); border: 1px solid var(--danger); }
    .dup-alerta ul { margin: 0.4rem 0 0; padding-left: 1.1rem; }
    .dup-alerta li { margin: 0.15rem 0; }

    .dup-grupos { margin-top: 0.9rem; display: flex; flex-direction: column; gap: 0.8rem; }
    .dup-grupo { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
    .dup-grupo-tit { padding: 0.45rem 0.7rem; background: var(--bg-muted, rgba(0,0,0,.04));
      font-weight: 700; font-size: 0.82rem; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted); }
    .dup-tabla-wrap { overflow-x: auto; }
    .dup-tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .dup-tabla th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: .03em;
      color: var(--text-muted); padding: 0.4rem 0.7rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .dup-tabla td { padding: 0.45rem 0.7rem; border-bottom: 1px solid var(--border); vertical-align: middle; white-space: nowrap; }
    .dup-tabla tr:last-child td { border-bottom: 0; }
    .dup-tabla small { color: var(--text-muted); }
    .fila-del.riesgo { background: var(--warning-soft); }

    .tag { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
    .tag.keep { background: var(--success-soft, rgba(22,163,74,.15)); color: var(--success); }
    .tag.del { background: var(--danger-soft, rgba(220,38,38,.12)); color: var(--danger); }

    .dup-json { margin: 0.5rem 0 0; padding: 0.6rem; max-height: 320px; overflow: auto;
      background: var(--bg-code, rgba(0,0,0,.06)); border-radius: var(--radius-sm);
      font-size: 0.78rem; white-space: pre-wrap; word-break: break-word; }
  `],
})
export class LimpiarDuplicados {
  private readonly service = inject(TrabajadorService);

  /** Emite tras una EJECUCIÓN real para que el padre recargue la tabla. */
  readonly hecho = output<void>();

  /** '' | 'simular' | 'ejecutar' — acción en curso. */
  readonly corriendo = signal<'' | 'simular' | 'ejecutar'>('');
  /** Último modo COMPLETADO (para saber si mostrar el botón de ejecutar). */
  readonly ultimoModo = signal<'' | 'simular' | 'ejecutar'>('');
  readonly resultado = signal<LimpiarDuplicadosResponse | null>(null);
  readonly error = signal('');
  readonly verJson = signal(false);

  /** ¿Hay algo que borrar? (en simulación `eliminados` es 0; el conteo real es duplicados_detectados). */
  readonly hayQueLimpiar = computed(() => (this.resultado()?.duplicados_detectados ?? 0) > 0);

  /** Cuántos de los que se borrarían tienen rostro (se perdería el embedding). */
  readonly rostrosEnRiesgo = computed(() => {
    const r = this.resultado();
    if (!r) return 0;
    return r.detalle.reduce((n, g) => n + g.eliminados.filter((e) => e.tiene_embedding).length, 0);
  });

  /** Resumen legible según el modo. */
  readonly resumen = computed(() => {
    const r = this.resultado();
    if (!r) return '';
    if (this.ultimoModo() === 'ejecutar') {
      const partes = [`${r.eliminados} borrado(s)`];
      if (r.no_eliminados.length) partes.push(`${r.no_eliminados.length} omitido(s)`);
      return partes.join(' · ');
    }
    return `${r.grupos_con_duplicados} grupo(s) · ${r.duplicados_detectados} a borrar`;
  });

  simular(): void {
    this.correr(true);
  }

  ejecutar(): void {
    const r = this.resultado();
    const n = r?.duplicados_detectados ?? 0;
    const riesgo = this.rostrosEnRiesgo();
    let txt = `¿Borrar ${n} trabajador(es) duplicado(s)? Esta acción NO es reversible.`;
    if (riesgo > 0) txt += `\n\nAtención: ${riesgo} de ellos tienen rostro registrado, que se perderá.`;
    if (!confirm(txt)) return;
    this.correr(false);
  }

  private correr(simular: boolean): void {
    this.corriendo.set(simular ? 'simular' : 'ejecutar');
    this.error.set('');
    this.verJson.set(false);
    this.service.limpiarDuplicados(simular).subscribe({
      next: (r) => {
        this.resultado.set(r);
        this.ultimoModo.set(simular ? 'simular' : 'ejecutar');
        this.corriendo.set('');
        if (!simular) this.hecho.emit(); // borró de verdad → recargar tabla
      },
      error: (e) => {
        this.error.set(this.msg(e));
        this.corriendo.set('');
      },
    });
  }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error.';
  }
}
