import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';
import {
  FaceDetection,
  LandmarkMode,
  PerformanceMode,
  ContourMode,
} from '@capacitor-mlkit/face-detection';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';

import { firstValueFrom } from 'rxjs';

import { CameraService, stripDataUrl, dataUrlToBlob } from '../../service/camera';
import { ScannerService } from '../../service/escaneo';
import { ScannerConfigService } from '../../service/scanner-config';
import { VozService } from '../../service/voz';
import { AuthService } from '../../service/auth';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { DispositivoService } from '../../service/dispositivo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { Dispositivo } from '../../core/interfaces/dispositivo';
import { MatchService } from '../../core/match.service';
import { FaceEngine } from '../../core/face-engine';
import { DbService } from '../../core/db.service';
import { EventosService } from '../../core/eventos.service';
import { SubidaService } from '../../core/subida.service';
import { LogService } from '../../core/log.service';
import { ConexionService } from '../../core/conexion.service';
import { AccesoParams, AccesoResponse } from '../../core/interfaces/escaneo';
import { ordenarKps } from '../../core/face-kps.util';
import { dentroDeArea } from '../../core/geo.util';

const UMBRAL = 0.5; // match coseno (= motor.py)
const UMBRAL_LIVENESS = 0.5; // anti-spoof: score_real mínimo
const COOLDOWN_MS = 8000; // no re-fichar a la misma persona seguido
const COOLDOWN_INTENTO_MS = 8000; // no registrar el mismo intento cada frame
const MAX_POSE = 25; // grados
const TICK_MS = 700; // ~1.4 fps (ML Kit por archivo es pesado)
const FRAMES_SALIDA = 4; // frames sin cara para desbloquear (~2.8s; evita re-detección por parpadeo)

type Estado = 'idle' | 'cargando' | 'detectando' | 'error';

interface Toast {
  id: number;
  exito: boolean;
  titulo: string;
  nombre: string;
  pct: number | null;
  mensaje?: string;
}

/**
 * Escáner OFFLINE con la MISMA UI que el online (`scanner-page`): <video> en caja,
 * botón Iniciar, toasts y pantalla completa. La diferencia es que reconoce EN EL EQUIPO
 * (ML Kit sobre el frame → anti-spoof → embedding buffalo_l → match) y guarda en SQLite.
 */
@Component({
  selector: 'app-escaneo',
  standalone: true,
  imports: [DecimalPipe, RouterLink, FaIconComponent],
  styleUrl: '../scanner-page/scanner-page.scss',
  template: `
    <section class="crud-page scanner">
      <header class="crud-header"><h1>Escáner</h1></header>

      @if (error()) { <div class="alert alert-error">{{ error() }}</div> }

      <div class="scanner-resumen">
        @if (cfg.idPuerta()) {
          <span><strong>Puerta:</strong> {{ puertaNombre() }}</span>
          <span><strong>Registro:</strong> {{ cfg.tipoRegistro() === 'entrada' ? 'Entrada' : 'Salida' }}</span>
          @if (cfg.idDispositivo()) {
            <span><strong>Dispositivo:</strong> {{ dispositivoNombre() }}</span>
          }
          <a routerLink="/configuracion" class="scanner-config-link">Cambiar</a>
        } @else {
          <span>No hay puerta configurada.</span>
          <a routerLink="/configuracion" class="scanner-config-link">Configurar escáner</a>
        }
      </div>

      <div class="scanner-stage">
        <div class="video-wrap" [class.fullscreen]="camaraAbierta()" (click)="mostrarControles()">
          <video #video playsinline muted></video>
          <canvas #overlay class="overlay"></canvas>

          @if (toasts().length) {
            <div class="scanner-toasts">
              @for (t of toasts(); track t.id) {
                <div class="scanner-toast" [class.ok]="t.exito" [class.fail]="!t.exito">
                  <div class="toast-head">
                    <strong>{{ t.titulo }}</strong>
                    @if (t.pct != null) { <span class="toast-pct">{{ t.pct }}%</span> }
                  </div>
                  <span class="toast-nombre">{{ t.nombre }}</span>
                  @if (t.mensaje) { <span class="toast-msg">{{ t.mensaje }}</span> }
                </div>
              }
            </div>
          }

          @if (status() === 'idle') {
            <div class="stage-overlay"><p>Presiona <strong>Iniciar</strong> para fichar.</p></div>
          }
          @if (status() === 'cargando') {
            <div class="stage-overlay"><p>Abriendo cámara…</p></div>
          }
          @if (status() === 'detectando') {
            <div class="stage-hint" [class.detectado]="!!ultimo()?.exito">
              <span>{{ ultimo()?.texto ?? 'Acerca tu rostro a la cámara' }}</span>
            </div>
          }
        </div>
      </div>

      <div
        class="scanner-actions"
        [class.flotante]="camaraAbierta()"
        [class.oculto]="camaraAbierta() && !controlesVisibles()"
      >
        <button class="btn btn-ghost btn-voz" type="button" (click)="toggleVoz()"
          [title]="voz.activa() ? 'Silenciar voz' : 'Activar voz'">
          <fa-icon [icon]="voz.activa() ? iconVoz : iconMute" />
        </button>

        @switch (status()) {
          @case ('idle') { <button class="btn btn-primary" (click)="iniciar()">Iniciar</button> }
          @case ('error') { <button class="btn btn-primary" (click)="iniciar()">Reintentar</button> }
          @default {
            <button class="btn btn-ghost" (click)="detener()" [disabled]="status() === 'cargando'">Detener</button>
          }
        }
      </div>
    </section>
  `,
})
export class EscaneoComponent implements OnDestroy {
  private readonly camera = inject(CameraService);
  protected readonly cfg = inject(ScannerConfigService);
  protected readonly voz = inject(VozService);
  private readonly auth = inject(AuthService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly dispositivoService = inject(DispositivoService);
  private readonly match = inject(MatchService);
  private readonly db = inject(DbService);
  private readonly eventos = inject(EventosService);
  private readonly subida = inject(SubidaService);
  private readonly log = inject(LogService);
  private readonly scanner = inject(ScannerService);
  private readonly conexion = inject(ConexionService);

  readonly iconVoz = faVolumeHigh;
  readonly iconMute = faVolumeXmark;

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild<ElementRef<HTMLCanvasElement>>('overlay');

  readonly status = signal<Estado>('idle');
  readonly error = signal<string | null>(null);
  readonly toasts = signal<Toast[]>([]);
  /** Último resultado (para el hint del centro). */
  readonly ultimo = signal<{ exito: boolean; texto: string } | null>(null);
  readonly controlesVisibles = signal(true);
  readonly camaraAbierta = computed(
    () => this.status() === 'cargando' || this.status() === 'detectando',
  );
  readonly puertaNombre = signal('');
  readonly dispositivoNombre = signal('');

  private timer?: ReturnType<typeof setInterval>;
  private watchId?: string;
  private controlesTimer?: ReturnType<typeof setTimeout>;
  private procesando = false;
  private bloqueado = false;      // ya reconoció una cara → no re-escanea hasta que se vaya
  private framesSinCara = 0;      // frames seguidos sin cara → desbloquea
  private toastSeq = 0;
  private cooldown = new Map<number, number>();
  private cooldownIntento = new Map<string, number>();
  private geo: { lon: number; lat: number } | null = null;
  private poligono: string | null = null;

  constructor() {
    // Nombres de puerta/dispositivo para el resumen (con :read o scanner:use).
    this.auth
      .listarSiAlguno(['puertas:read', 'scanner:use'], this.puertaService.list())
      .subscribe({ next: (d: PuertaAcceso[]) => this.resolverNombres(d, null), error: () => {} });
    this.auth
      .listarSiAlguno(['dispositivos:read', 'scanner:use'], this.dispositivoService.list())
      .subscribe({ next: (d: Dispositivo[]) => this.resolverNombres(null, d), error: () => {} });
  }

  private resolverNombres(puertas: PuertaAcceso[] | null, disps: Dispositivo[] | null): void {
    if (puertas) {
      const p = puertas.find((x) => x.id_puerta === this.cfg.idPuerta());
      this.puertaNombre.set(p?.nombre_puerta ?? (this.cfg.idPuerta() ? `#${this.cfg.idPuerta()}` : ''));
    }
    if (disps) {
      const d = disps.find((x) => x.id_dispositivo === this.cfg.idDispositivo());
      this.dispositivoNombre.set(d?.nombre_dispositivo ?? '');
    }
  }

  async iniciar(): Promise<void> {
    if (!this.cfg.idPuerta()) {
      this.error.set('Configura una puerta en Configuración antes de iniciar.');
      return;
    }
    if (!this.camera.isSupported) {
      this.error.set('La cámara no está disponible en este dispositivo.');
      return;
    }
    this.error.set(null);
    this.toasts.set([]);
    this.ultimo.set(null);
    this.bloqueado = false;
    this.framesSinCara = 0;
    this.status.set('cargando');
    try {
      await this.match.cargar(); // embeddings del roster a RAM
      // Nombre de la puerta + polígono (para dentro_de_area) desde SQLite local.
      const idPuerta = this.cfg.idPuerta();
      if (idPuerta) {
        this.poligono = await this.db.getPoligonoDePuerta(idPuerta);
        const n = await this.db.getPuertaNombre(idPuerta);
        if (n) this.puertaNombre.set(n);
      }
      // Ubicación de ALTA PRECISIÓN, actualizada en vivo (es un dispositivo móvil).
      try {
        this.watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (pos) => { if (pos) this.geo = { lon: pos.coords.longitude, lat: pos.coords.latitude }; });
      } catch { this.geo = null; }

      await this.camera.start(this.video()!.nativeElement);
      this.status.set('detectando');
      this.mostrarControles();
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.subida.subirPendientes(); // vacía la cola al abrir; la subida periódica es GLOBAL (App)
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo abrir la cámara.');
      this.status.set('error');
    }
  }

  detener(): void {
    clearInterval(this.timer);
    if (this.watchId) { Geolocation.clearWatch({ id: this.watchId }); this.watchId = undefined; }
    clearTimeout(this.controlesTimer);
    this.controlesVisibles.set(true);
    this.camera.stop();
    this.voz.callar();
    this.bloqueado = false;
    this.limpiarCanvas();
    this.status.set('idle');
  }

  private async tick(): Promise<void> {
    if (this.procesando) return;
    const v = this.video()?.nativeElement;
    if (!v || v.readyState < 2) return;
    this.procesando = true;
    let uri: string | undefined;
    try {
      // Frame del <video> → archivo (ML Kit y FaceEngine trabajan sobre archivo).
      const dataUrl = this.camera.capture(v, 0.9);
      const w = await Filesystem.writeFile({
        path: `scan_${Date.now()}.jpg`, data: stripDataUrl(dataUrl), directory: Directory.Cache });
      uri = w.uri;

      const { faces } = await FaceDetection.processImage({
        path: uri, performanceMode: PerformanceMode.Accurate,
        landmarkMode: LandmarkMode.All, contourMode: ContourMode.None, minFaceSize: 0.15 });

      // Sin cara (o varias): si se fue de verdad (2 frames), desbloquea para el siguiente.
      if (faces.length !== 1) {
        if (++this.framesSinCara >= FRAMES_SALIDA) this.reset();
        return;
      }
      this.framesSinCara = 0;
      const f = faces[0];
      const b = { left: f.bounds.left, top: f.bounds.top, right: f.bounds.right, bottom: f.bounds.bottom };

      // Ya reconoció una cara y sigue ahí → mantiene el recuadro, NO re-escanea.
      if (this.bloqueado) {
        this.dibujarBox(v, b, this.ultimo()?.exito ? '#16a34a' : '#dc2626', this.ultimo()?.texto);
        return;
      }

      // Pose no frontal / sin landmarks → recuadro neutro, aún no reconoce.
      if (Math.abs(f.headEulerAngleY ?? 0) > MAX_POSE || Math.abs(f.headEulerAngleX ?? 0) > MAX_POSE) {
        this.dibujarBox(v, b, '#ffffff'); return;
      }
      const kps = ordenarKps(f.landmarks);
      if (!kps) { this.dibujarBox(v, b, '#ffffff'); return; }
      this.dibujarBox(v, b, '#facc15'); // amarillo: analizando

      // Anti-spoof: se calcula y loguea siempre; solo BLOQUEA si el toggle está ON.
      const bbox = [b.left, b.top, b.right, b.bottom];
      let live: { esReal: boolean; scoreReal: number } | undefined;
      try { live = await FaceEngine.checkLiveness({ path: uri, bbox }); }
      catch (e: any) { this.log.warn(`liveness err: ${e?.message ?? e}`); }
      if (live) this.log.info(`liveness real=${live.esReal} score=${live.scoreReal.toFixed(2)}`);
      if (this.cfg.livenessOffline() && live && (!live.esReal || live.scoreReal < UMBRAL_LIVENESS)) {
        if (!this.enCooldownIntento('spoofing')) {
          this.cooldownIntento.set('spoofing', Date.now());
          await this.eventos.registrarIntento({ tipo: 'spoofing', sim: null,
            lat: this.geo?.lat ?? null, lon: this.geo?.lon ?? null });
          this.subida.subirPendientes();
        }
        this.resultado(false, 'Prueba de vida', '—', null, 'Posible foto/pantalla');
        this.bloqueado = true;
        this.dibujarBox(v, b, '#dc2626', 'Prueba de vida');
        return;
      }

      const { embedding } = await FaceEngine.extractEmbedding({ path: uri, kps });
      const r = this.match.buscar(Float32Array.from(embedding));

      if (r && r.sim >= UMBRAL) {
        const nombre = `${r.nombre} ${r.apellido}`;
        if (!this.enCooldown(r.id)) {         // 1ª vez (o >8s) → registra + avisa
          this.cooldown.set(r.id, Date.now());
          const dentro = this.geo ? dentroDeArea(this.geo.lon, this.geo.lat, this.poligono) : false;
          await this.eventos.registrarAsistencia({ id_trabajador: r.id, sim: r.sim, dentro,
            lat: this.geo?.lat ?? null, lon: this.geo?.lon ?? null });
          this.subida.subirPendientes();
          this.resultado(true, 'Fichaje registrado', nombre, Math.round(r.sim * 100));
        } else {
          this.ultimo.set({ exito: true, texto: `✓ ${nombre}` }); // ya registrado: sin toast/voz repetido
        }
        this.bloqueado = true;
        this.dibujarBox(v, b, '#16a34a', nombre);
      } else {
        // Local no lo reconoció → si HAY INTERNET, prueba en el servidor (híbrido).
        let online: AccesoResponse | null = null;
        if (this.conexion.hayInternet()) online = await this.buscarEnServidor(dataUrl);

        if (online?.acceso && online.trabajador) {
          const nombre = `${online.trabajador.nombre} ${online.trabajador.apellido}`;
          this.resultado(true, 'Fichaje (servidor)', nombre,
            online.confianza != null ? Math.round(online.confianza * 100) : null);
          this.bloqueado = true;
          this.dibujarBox(v, b, '#16a34a', nombre);
        } else {
          if (!this.enCooldownIntento('desconocido')) {
            this.cooldownIntento.set('desconocido', Date.now());
            await this.eventos.registrarIntento({ tipo: 'desconocido', sim: r?.sim ?? null,
              lat: this.geo?.lat ?? null, lon: this.geo?.lon ?? null });
            this.subida.subirPendientes();
          }
          this.resultado(false, 'No reconocido', '—', null, 'Rostro no reconocido');
          this.bloqueado = true;
          this.dibujarBox(v, b, '#dc2626', 'No reconocido');
        }
      }
    } catch { /* frame malo, sigue */ }
    finally {
      if (uri) Filesystem.deleteFile({ path: uri.split('/').pop()!, directory: Directory.Cache }).catch(() => {});
      this.procesando = false;
    }
  }

  /** Dibuja el recuadro de la cara sobre el <video> (espejado, el video va con scaleX(-1)). */
  private dibujarBox(
    v: HTMLVideoElement,
    b: { left: number; top: number; right: number; bottom: number },
    color: string, label?: string,
  ): void {
    const canvas = this.overlay()?.nativeElement;
    if (!canvas) return;
    if (canvas.width !== v.videoWidth) canvas.width = v.videoWidth;
    if (canvas.height !== v.videoHeight) canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = b.right - b.left, h = b.bottom - b.top;
    const mx = canvas.width - b.left - w; // espejo
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.strokeRect(mx, b.top, w, h);
    if (label) {
      ctx.font = 'bold 26px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(mx, Math.max(0, b.top - 34), tw + 16, 32);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, mx + 8, Math.max(24, b.top - 10));
    }
  }

  private limpiarCanvas(): void {
    const canvas = this.overlay()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /** Fallback ONLINE: manda el frame al servidor (mismo endpoint que el scanner web). */
  private async buscarEnServidor(dataUrl: string): Promise<AccesoResponse | null> {
    try {
      const params: AccesoParams = {
        id_puerta: this.cfg.idPuerta(),
        tipo_registro: this.cfg.tipoRegistro(),
        id_dispositivo: this.cfg.idDispositivo() || undefined,
        latitud: this.geo?.lat,
        longitud: this.geo?.lon,
      };
      this.log.net('→ POST scanner/acceso/liveness (fallback servidor)');
      const res = await firstValueFrom(this.scanner.acceso(params, [dataUrlToBlob(dataUrl)]));
      this.log.ok(`← acceso=${res.acceso} ${res.trabajador ? res.trabajador.nombre : ''}`);
      return res;
    } catch (e: any) {
      this.log.warn(`fallback servidor falló: ${e?.message ?? e}`);
      return null;
    }
  }

  /** Desbloquea (la cara se fue): listo para escanear a la siguiente persona. */
  private reset(): void {
    if (!this.bloqueado && !this.ultimo()) return;
    this.bloqueado = false;
    this.ultimo.set(null);
    this.limpiarCanvas();
  }

  /** Empuja un toast + hint + voz (como el online). */
  private resultado(exito: boolean, titulo: string, nombre: string, pct: number | null, mensaje?: string): void {
    const id = ++this.toastSeq;
    this.toasts.update((arr) => [{ id, exito, titulo, nombre, pct, mensaje }, ...arr].slice(0, 4));
    setTimeout(() => this.toasts.update((arr) => arr.filter((x) => x.id !== id)), 5000);
    this.ultimo.set({ exito, texto: exito ? `✓ ${nombre}` : `${titulo}: ${mensaje ?? nombre}` });
    this.voz.decir(exito ? `Aprobado, ${nombre}.` : (mensaje ?? 'Acceso denegado.'));
  }

  toggleVoz(): void {
    const activa = !this.voz.activa();
    this.voz.activa.set(activa);
    if (!activa) this.voz.callar();
  }

  mostrarControles(): void {
    this.controlesVisibles.set(true);
    clearTimeout(this.controlesTimer);
    if (this.camaraAbierta()) {
      this.controlesTimer = setTimeout(() => this.controlesVisibles.set(false), 3500);
    }
  }

  private enCooldown(id: number): boolean {
    const t = this.cooldown.get(id);
    return t !== undefined && Date.now() - t < COOLDOWN_MS;
  }
  private enCooldownIntento(tipo: 'spoofing' | 'desconocido'): boolean {
    const t = this.cooldownIntento.get(tipo);
    return t !== undefined && Date.now() - t < COOLDOWN_INTENTO_MS;
  }

  ngOnDestroy(): void {
    this.detener();
  }
}
