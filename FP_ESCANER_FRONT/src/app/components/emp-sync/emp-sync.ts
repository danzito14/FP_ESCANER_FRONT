import { Component, inject, signal } from '@angular/core';

import { EmpSyncService, FotoPendiente, ResumenPendiente } from '../../service/emp-sync';

/**
 * Barra de sincronización SYS21 (solo admin). El back lo hace automático; esto es para
 * dispararlo manualmente: sincronizar, procesar fotos, y resolver las fotos pendientes.
 */
@Component({
  selector: 'app-emp-sync',
  standalone: true,
  imports: [],
  template: `
    <div class="sync-card">
      <div class="sync-head">
        <strong>Sincronización SYS21</strong>
        @if (mensaje()) {
          <span class="sync-msg" [class.err]="error()">{{ mensaje() }}</span>
        }
      </div>

      <div class="sync-acciones">
        <button class="btn btn-sm" [disabled]="!!corriendo()" (click)="run()">
          {{ corriendo() === 'run' ? 'Sincronizando…' : '↻ Sincronizar con SYS21' }}
        </button>
        <button class="btn btn-sm" [disabled]="!!corriendo()" (click)="procesarFotos()">
          {{ corriendo() === 'fotos' ? 'Procesando…' : '🖼 Procesar fotos' }}
        </button>
        <button class="btn btn-sm btn-ghost" (click)="togglePendientes()">
          {{ abierto() ? 'Ocultar pendientes' : 'Fotos pendientes' }}@if (pendientes().length) { ({{ pendientes().length }}) }
        </button>
      </div>

      @if (abierto()) {
        @if (resumen().length) {
          <div class="sync-resumen">
            <span class="sync-resumen-lbl">Razones:</span>
            @for (r of resumen(); track $index) {
              <span class="sync-motivo">{{ r.motivo || r.origen || 'otro' }} <b>{{ r.total }}</b></span>
            }
          </div>
        }
        @if (cargandoPend()) {
          <p class="sync-hint">Cargando…</p>
        } @else if (pendientes().length === 0) {
          <p class="sync-hint">No hay fotos pendientes. ✓</p>
        } @else {
          <ul class="sync-lista">
            @for (p of pendientes(); track p.id_pendiente) {
              <li>
                <span class="sync-li-nombre">
                  {{ p.nombre || p.id_emp || ('Pendiente #' + p.id_pendiente) }}
                  @if (p.motivo) { <small>— {{ p.motivo }}</small> }
                </span>
                <span class="sync-li-acc">
                  <button class="btn btn-sm" (click)="resolver(p, 'resuelta')">Resuelta</button>
                  <button class="btn btn-sm btn-ghost" (click)="resolver(p, 'ignorada')">Ignorar</button>
                </span>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: [`
    .sync-card {
      border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--bg-card); padding: 0.9rem 1rem; margin-bottom: 1.25rem;
    }
    .sync-head { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
    .sync-head strong { font-size: 0.95rem; }
    .sync-msg { font-size: 0.82rem; color: var(--success); }
    .sync-msg.err { color: var(--danger); }
    .sync-acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .sync-hint { color: var(--text-muted); font-size: 0.85rem; margin: 0.6rem 0 0; }
    .sync-resumen { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.6rem 0 0; }
    .sync-resumen-lbl { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
    .sync-motivo { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.6rem;
      border-radius: 999px; background: var(--warning-soft); color: var(--warning); font-size: 0.8rem; }
    .sync-motivo b { font-weight: 700; }
    .sync-lista { list-style: none; padding: 0; margin: 0.6rem 0 0;
      border: 1px solid var(--border); border-radius: var(--radius-sm); max-height: 260px; overflow: auto; }
    .sync-lista li { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.88rem; }
    .sync-lista li:last-child { border-bottom: 0; }
    .sync-li-nombre small { color: var(--text-muted); }
    .sync-li-acc { display: flex; gap: 0.4rem; flex-shrink: 0; }
  `],
})
export class EmpSync {
  private readonly sync = inject(EmpSyncService);

  /** '' | 'run' | 'fotos' — acción en curso. */
  readonly corriendo = signal<'' | 'run' | 'fotos'>('');
  readonly mensaje = signal('');
  readonly error = signal(false);
  readonly abierto = signal(false);
  readonly cargandoPend = signal(false);
  readonly pendientes = signal<FotoPendiente[]>([]);
  readonly resumen = signal<ResumenPendiente[]>([]);

  run(): void {
    this.corriendo.set('run'); this.aviso('', false);
    this.sync.run().subscribe({
      next: () => { this.aviso('✓ Sincronización disparada (corre en segundo plano).', false); this.corriendo.set(''); },
      error: (e) => { this.aviso('✕ ' + this.msg(e), true); this.corriendo.set(''); },
    });
  }

  procesarFotos(): void {
    this.corriendo.set('fotos'); this.aviso('', false);
    this.sync.fotos().subscribe({
      next: () => { this.aviso('✓ Procesamiento de fotos disparado.', false); this.corriendo.set(''); },
      error: (e) => { this.aviso('✕ ' + this.msg(e), true); this.corriendo.set(''); },
    });
  }

  togglePendientes(): void {
    const abrir = !this.abierto();
    this.abierto.set(abrir);
    if (abrir) this.cargarPendientes();
  }

  cargarPendientes(): void {
    this.cargandoPend.set(true);
    this.sync.fotosPendientes().subscribe({
      next: (d) => { this.pendientes.set(d ?? []); this.cargandoPend.set(false); },
      error: (e) => { this.aviso('✕ ' + this.msg(e), true); this.cargandoPend.set(false); },
    });
    // Razones (por qué fallan), agrupadas.
    this.sync.resumenPendientes().subscribe({
      next: (d) => this.resumen.set(d ?? []),
      error: () => this.resumen.set([]),
    });
  }

  resolver(p: FotoPendiente, estado: 'resuelta' | 'ignorada'): void {
    this.sync.resolver(p.id_pendiente, estado).subscribe({
      next: () => this.pendientes.update((arr) => arr.filter((x) => x.id_pendiente !== p.id_pendiente)),
      error: (e) => this.aviso('✕ ' + this.msg(e), true),
    });
  }

  private aviso(m: string, err: boolean): void { this.mensaje.set(m); this.error.set(err); }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error.';
  }
}
