import { Component, computed, inject, signal } from '@angular/core';

import {
  AreaInvalida,
  EmpSyncService,
  EstadoFoto,
  FotoPendiente,
  MotivoCatalogo,
  ResumenPendiente,
} from '../../service/emp-sync';

/**
 * Barra de sincronización SYS21 (solo admin). El back lo hace automático; esto es para
 * dispararlo manualmente y revisar las fotos pendientes: filtrar por estado/origen/motivo,
 * ver el conteo por razón, resolver/ignorar cada fila y listar las áreas sin clasificar.
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
          {{ corriendo() === 'run' ? 'Sincronizando…' : 'Sincronizar con SYS21' }}
        </button>
        <button class="btn btn-sm" [disabled]="!!corriendo()" (click)="procesarFotos()">
          {{ corriendo() === 'fotos' ? 'Procesando…' : 'Procesar fotos' }}
        </button>
        <button class="btn btn-sm btn-ghost" (click)="togglePendientes()">
          {{ abierto() ? 'Ocultar fotos pendientes' : 'Fotos pendientes' }}@if (abierto() && pendientes().length) { ({{ pendientes().length }}) }
        </button>
      </div>

      @if (abierto()) {
        <div class="sync-filtros">
          <label>
            <span>Estado</span>
            <select [value]="fEstado()" (change)="setEstado($any($event.target).value)">
              <option value="pendiente">Pendientes</option>
              <option value="resuelto">Resueltas</option>
              <option value="ignorado">Ignoradas</option>
              <option value="">Todas</option>
            </select>
          </label>
          <label>
            <span>Origen</span>
            <select [value]="fOrigen()" (change)="setOrigen($any($event.target).value)">
              <option value="">Todos</option>
              <option value="agricola">agricola</option>
              <option value="agricola_com">agricola_com</option>
            </select>
          </label>
          <label>
            <span>Motivo</span>
            <select [value]="fMotivo()" (change)="setMotivo($any($event.target).value)">
              <option value="">Todos</option>
              @for (m of motivos(); track m.motivo) {
                <option [value]="m.motivo">{{ m.label }}</option>
              }
            </select>
          </label>
        </div>

        @if (resumenPorMotivo().length) {
          <div class="sync-resumen">
            <span class="sync-resumen-lbl">Razones:</span>
            @for (r of resumenPorMotivo(); track r.motivo) {
              <span class="sync-motivo" [title]="r.motivo">{{ etiqueta(r.motivo) }} <b>{{ r.total }}</b></span>
            }
          </div>
        }

        @if (cargandoPend()) {
          <p class="sync-hint">Cargando…</p>
        } @else if (pendientes().length === 0) {
          <p class="sync-hint">Sin fotos con este filtro. ✓</p>
        } @else {
          <div class="sync-tabla-wrap">
            <table class="sync-tabla">
              <thead>
                <tr><th>Trabajador</th><th>Motivo</th><th>Origen</th><th>Detalle</th><th></th></tr>
              </thead>
              <tbody>
                @for (p of pendientes(); track p.id_pendiente) {
                  <tr>
                    <td>{{ p.trabajador_nombre || p.id_emp || '—' }}</td>
                    <td><span class="sync-badge" [title]="p.motivo">{{ etiqueta(p.motivo) }}</span></td>
                    <td>{{ p.origen_nomina }}</td>
                    <td class="sync-detalle" [title]="p.detalle || ''">{{ p.detalle || '—' }}</td>
                    <td class="sync-li-acc">
                      @if (p.estado === 'pendiente') {
                        <button class="btn btn-sm" (click)="resolver(p, 'resuelto')">Resuelta</button>
                        <button class="btn btn-sm btn-ghost" (click)="resolver(p, 'ignorado')">Ignorar</button>
                      } @else {
                        <span class="sync-estado" [attr.data-e]="p.estado">{{ p.estado }}</span>
                        <button class="btn btn-sm btn-ghost" (click)="resolver(p, 'pendiente')">Reabrir</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <div class="sync-areas">
          <button class="btn btn-sm btn-ghost" (click)="toggleAreas()">
            {{ verAreas() ? 'Ocultar áreas sin clasificar' : 'Áreas sin clasificar (area_invalida)' }}
          </button>
          @if (verAreas()) {
            @if (cargandoAreas()) {
              <p class="sync-hint">Cargando…</p>
            } @else if (areas().length === 0) {
              <p class="sync-hint">Ninguna área sin clasificar. ✓</p>
            } @else {
              <ul class="sync-lista">
                @for (a of areas(); track $index) {
                  <li>
                    <span class="sync-li-nombre">
                      {{ a.detalle || '(sin detalle)' }} <small>· {{ a.origen_nomina }}</small>
                    </span>
                    <span class="sync-area-total">{{ a.total }}</span>
                  </li>
                }
              </ul>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    /* El marco de tarjeta lo provee el contenedor .admin-tools de la página. */
    .sync-head { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
    .sync-head strong { font-size: 0.95rem; }
    .sync-msg { font-size: 0.82rem; color: var(--success); }
    .sync-msg.err { color: var(--danger); }
    .sync-acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .sync-hint { color: var(--text-muted); font-size: 0.85rem; margin: 0.6rem 0 0; }

    .sync-filtros { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.8rem 0 0; }
    .sync-filtros label { display: flex; flex-direction: column; gap: 0.2rem; }
    .sync-filtros span { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.03em;
      text-transform: uppercase; color: var(--text-muted); }
    .sync-filtros select { padding: 0.4rem 0.6rem; border: 1px solid var(--border-strong, var(--border));
      border-radius: 8px; background: var(--bg-card); color: var(--text-primary); font: inherit; }

    .sync-resumen { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.7rem 0 0; }
    .sync-resumen-lbl { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
    .sync-motivo { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.6rem;
      border-radius: 999px; background: var(--warning-soft); color: var(--warning); font-size: 0.8rem; }
    .sync-motivo b { font-weight: 700; }

    .sync-tabla-wrap { margin: 0.7rem 0 0; border: 1px solid var(--border); border-radius: var(--radius-sm);
      max-height: 340px; overflow: auto; }
    .sync-tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .sync-tabla th { position: sticky; top: 0; background: var(--bg-card); text-align: left;
      font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted);
      padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--border); }
    .sync-tabla td { padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .sync-tabla tr:last-child td { border-bottom: 0; }
    .sync-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px;
      background: var(--warning-soft); color: var(--warning); font-size: 0.78rem; }
    .sync-detalle { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--text-muted); }
    .sync-estado { font-size: 0.78rem; color: var(--text-muted); text-transform: capitalize; margin-right: 0.35rem; }
    .sync-li-acc { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; justify-content: flex-end; }

    .sync-areas { margin-top: 0.8rem; }
    .sync-lista { list-style: none; padding: 0; margin: 0.5rem 0 0;
      border: 1px solid var(--border); border-radius: var(--radius-sm); max-height: 240px; overflow: auto; }
    .sync-lista li { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
    .sync-lista li:last-child { border-bottom: 0; }
    .sync-li-nombre small { color: var(--text-muted); }
    .sync-area-total { font-weight: 700; color: var(--warning); }
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
  readonly motivos = signal<MotivoCatalogo[]>([]);

  readonly verAreas = signal(false);
  readonly cargandoAreas = signal(false);
  readonly areas = signal<AreaInvalida[]>([]);

  /** Filtros de la tabla. `fEstado()` '' = todas. */
  readonly fEstado = signal<string>('pendiente');
  readonly fOrigen = signal<string>('');
  readonly fMotivo = signal<string>('');

  /** motivo → etiqueta legible (del catálogo). */
  private readonly labelMap = computed(() => {
    const m = new Map<string, string>();
    for (const x of this.motivos()) m.set(x.motivo, x.label);
    return m;
  });

  /** Conteo por motivo (suma los orígenes), ordenado desc. */
  readonly resumenPorMotivo = computed(() => {
    const acc = new Map<string, number>();
    for (const r of this.resumen()) acc.set(r.motivo, (acc.get(r.motivo) ?? 0) + r.total);
    return [...acc.entries()]
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total);
  });

  etiqueta(motivo?: string | null): string {
    if (!motivo) return '—';
    return this.labelMap().get(motivo) ?? motivo;
  }

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
    if (abrir) {
      if (!this.motivos().length) {
        this.sync.motivos().subscribe({ next: (d) => this.motivos.set(d ?? []), error: () => {} });
      }
      this.cargarPendientes();
    }
  }

  /** Recarga la tabla + el resumen según los filtros actuales. */
  cargarPendientes(): void {
    this.cargandoPend.set(true);
    const estado = this.fEstado();
    this.sync
      .fotosPendientes({ estado, origen: this.fOrigen(), motivo: this.fMotivo(), limit: 300 })
      .subscribe({
        next: (d) => { this.pendientes.set(d ?? []); this.cargandoPend.set(false); },
        error: (e) => { this.aviso('✕ ' + this.msg(e), true); this.cargandoPend.set(false); },
      });
    this.sync.resumenPendientes(estado).subscribe({
      next: (d) => this.resumen.set(d ?? []),
      error: () => this.resumen.set([]),
    });
  }

  setEstado(v: string): void { this.fEstado.set(v); this.cargarPendientes(); }
  setOrigen(v: string): void { this.fOrigen.set(v); this.cargarPendientes(); }
  setMotivo(v: string): void { this.fMotivo.set(v); this.cargarPendientes(); }

  toggleAreas(): void {
    const ver = !this.verAreas();
    this.verAreas.set(ver);
    if (ver) {
      this.cargandoAreas.set(true);
      this.sync.areasInvalidas().subscribe({
        next: (d) => { this.areas.set(d ?? []); this.cargandoAreas.set(false); },
        error: (e) => { this.aviso('✕ ' + this.msg(e), true); this.cargandoAreas.set(false); },
      });
    }
  }

  resolver(p: FotoPendiente, estado: EstadoFoto): void {
    this.sync.resolver(p.id_pendiente, estado).subscribe({
      next: () => this.cargarPendientes(),
      error: (e) => this.aviso('✕ ' + this.msg(e), true),
    });
  }

  private aviso(m: string, err: boolean): void { this.mensaje.set(m); this.error.set(err); }

  private msg(e: { error?: { detail?: string }; message?: string }): string {
    return e?.error?.detail ?? e?.message ?? 'Ocurrió un error.';
  }
}
