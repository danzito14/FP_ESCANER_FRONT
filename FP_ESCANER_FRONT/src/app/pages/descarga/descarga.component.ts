import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { AuthService } from '../../service/auth';
import { CameraService, etiquetaCamara } from '../../service/camera';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { ScannerConfigService } from '../../service/scanner-config';
import { SyncService } from '../../core/sync.service';

/**
 * Primer arranque del kiosko (APK). ANTES de descargar el modelo/roster pide la
 * configuración mínima del dispositivo (puerta, tipo de fichaje, cámara) y solo
 * entonces descarga. El tipo define qué roster baja ('mixto' = oficina + empaque).
 */
@Component({
  selector: 'app-descarga',
  standalone: true,
  imports: [],
  template: `
    <div class="descarga">
      @if (fase() === 'config') {
        <h2>Configura este dispositivo</h2>
        <p class="sub">Antes de descargar los datos, indica dónde y cómo va a operar el kiosko.</p>

        <label class="campo">
          <span>Puerta *</span>
          <select (change)="cfg.idPuerta.set(+$any($event.target).value)">
            <option [value]="0" [selected]="cfg.idPuerta() === 0">Selecciona una puerta…</option>
            @for (p of puertas(); track p.id_puerta) {
              <option [value]="p.id_puerta" [selected]="p.id_puerta === cfg.idPuerta()">{{ p.nombre_puerta }}</option>
            }
          </select>
        </label>

        <label class="campo">
          <span>Tipo de fichaje *</span>
          <select [value]="cfg.tipoFichaje()" (change)="cfg.tipoFichaje.set($any($event.target).value)">
            <option value="oficina">Oficina</option>
            <option value="campo">Campo</option>
            <option value="empaque">Empaque</option>
            <option value="mixto">Mixto (oficina + empaque)</option>
          </select>
          <small class="pista">Define qué padrón se descarga. "Mixto" baja oficina y empaque juntos.</small>
        </label>

        <label class="campo">
          <span>Cámara</span>
          <select (change)="cfg.camaraId.set($any($event.target).value)">
            <option value="" [selected]="cfg.camaraId() === ''">Predeterminada (frontal)</option>
            @for (c of camaras(); track c.id) {
              <option [value]="c.id" [selected]="c.id === cfg.camaraId()">{{ c.nombre }}</option>
            }
          </select>
        </label>
        <button type="button" class="link" (click)="detectarCamaras()" [disabled]="detectando()">
          {{ detectando() ? 'Detectando…' : 'Detectar cámaras' }}
        </button>

        @if (aviso()) { <p class="err">{{ aviso() }}</p> }

        <button class="btn-descargar" (click)="descargar()">Descargar datos</button>
        <small class="hint">Podrás cambiar todo esto luego en Configuración.</small>
      } @else {
        <h2>Preparando el dispositivo</h2>
        <p>{{ sync.mensaje() }}</p>

        @if (sync.estado() !== 'error') {
          <div class="barra"><div class="relleno" [style.width.%]="sync.progreso()"></div></div>
          <small>{{ sync.progreso() }}%</small>
        } @else {
          <div class="acciones">
            <button (click)="reintentar()">Reintentar</button>
            <button class="link" (click)="fase.set('config')">Cambiar configuración</button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .descarga { display:flex; flex-direction:column; align-items:center; gap:14px; padding:32px 20px; max-width:420px; margin:0 auto; }
    h2 { margin:0; }
    .sub { margin:0; color:#6b7280; text-align:center; font-size:.9rem; }
    .campo { display:flex; flex-direction:column; gap:4px; width:100%; }
    .campo > span { font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:#6b7280; }
    .campo select { padding:.6rem .7rem; border:1px solid #d1d5db; border-radius:.55rem; font:inherit; background:#fff; color:#111827; }
    .pista { color:#6b7280; font-size:.78rem; }
    .link { background:none; border:0; color:#245640; font:inherit; cursor:pointer; text-decoration:underline; padding:2px; }
    .err { color:#dc2626; font-size:.85rem; margin:0; }
    .btn-descargar { margin-top:6px; padding:.7rem 1.4rem; border:0; border-radius:.6rem; background:#16a34a; color:#fff; font:inherit; font-weight:600; cursor:pointer; }
    .hint { color:#9ca3af; font-size:.78rem; }
    .barra { width:100%; max-width:360px; height:10px; background:#e5e7eb; border-radius:6px; overflow:hidden; }
    .relleno { height:100%; background:#16a34a; transition:width .25s ease; }
    .acciones { display:flex; gap:12px; align-items:center; }
  `],
})
export class DescargaComponent implements OnInit {
  sync = inject(SyncService);
  cfg = inject(ScannerConfigService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly camera = inject(CameraService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** 'config' = pide puerta/cámara/tipo; 'descargando' = corre el bootstrap. */
  readonly fase = signal<'config' | 'descargando'>('config');
  readonly puertas = signal<PuertaAcceso[]>([]);
  readonly camaras = signal<{ id: string; nombre: string }[]>([]);
  readonly detectando = signal(false);
  readonly aviso = signal('');

  ngOnInit(): void {
    // El kiosko tiene scanner:use; puede o no tener puertas:read. Carga con cualquiera.
    this.auth
      .listarSiAlguno(['puertas:read', 'scanner:use'], this.puertaService.list())
      .subscribe({ next: (d) => this.puertas.set(d), error: () => {} });
    this.camera.listarCamaras().then((cs) => this.setCamaras(cs));
  }

  private setCamaras(cs: MediaDeviceInfo[]): void {
    this.camaras.set(cs.map((c, i) => ({ id: c.deviceId, nombre: etiquetaCamara(c.label, i) })));
  }

  async detectarCamaras(): Promise<void> {
    this.detectando.set(true);
    try {
      this.setCamaras(await this.camera.pedirPermisoYListar());
    } finally {
      this.detectando.set(false);
    }
  }

  /** Valida lo mínimo y arranca la descarga con el tipo elegido. */
  descargar(): void {
    if (this.cfg.idPuerta() <= 0) {
      this.aviso.set('Selecciona una puerta antes de descargar.');
      return;
    }
    this.aviso.set('');
    this.fase.set('descargando');
    this.correr();
  }

  private async correr(): Promise<void> {
    const ok = await this.sync.bootstrap(this.cfg.tipoFichaje());
    if (ok) {
      const next = this.route.snapshot.queryParamMap.get('next') || '/escaneo';
      this.router.navigateByUrl(next, { replaceUrl: true });
    }
  }

  reintentar(): void {
    this.correr();
  }
}
