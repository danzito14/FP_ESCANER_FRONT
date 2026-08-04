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
  Face,
  FaceDetection,
  LandmarkMode,
  PerformanceMode,
  ContourMode,
} from '@capacitor-mlkit/face-detection';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { CameraPreview } from '@capacitor-community/camera-preview';

import { firstValueFrom } from 'rxjs';

import { CameraService, stripDataUrl, dataUrlToBlob } from '../../service/camera';
import { PlatformService } from '../../service/platform';
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
import { VOZ_RECHAZO, vozAprobado } from '../scanner-page/scanner-base';

const UMBRAL = 0.5; // match coseno (= motor.py)
const UMBRAL_LIVENESS = 0.5; // anti-spoof: score_real mínimo
const COOLDOWN_MS = 8000; // no re-fichar a la misma persona seguido
const COOLDOWN_INTENTO_MS = 8000; // no registrar el mismo intento cada frame
const COOLDOWN_FALLBACK_MS = 6000; // mín. entre llamadas de fallback al servidor
const MAX_POSE = 25; // grados
const TICK_MS = 1200; // ~0.8 fps (ML Kit por archivo es pesado; menos = menos memoria)
/** Lado máx. (px) al que reducimos el frame antes de ML Kit/FaceEngine: menos bitmap nativo. */
const MAX_LADO = 600;
const FRAMES_SALIDA = 4; // frames sin cara para soltar la presencia (~2.8s; evita parpadeo)
const UMBRAL_DETECCION = 0.75; // calidad mínima de la cara (tamaño+frontal) para escanear (= SCORE_MIN web)

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
              <span>{{ ultimo()?.texto
                ?? (calidadPct() > 0 ? ('Acércate… ' + calidadPct() + '% (mín. 75%)') : 'Acerca tu rostro a la cámara') }}</span>
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
  private readonly platform = inject(PlatformService);

  readonly iconVoz = faVolumeHigh;
  readonly iconMute = faVolumeXmark;

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild<ElementRef<HTMLCanvasElement>>('overlay');

  readonly status = signal<Estado>('idle');
  readonly error = signal<string | null>(null);
  readonly toasts = signal<Toast[]>([]);
  /** Último resultado (para el hint del centro). */
  readonly ultimo = signal<{ exito: boolean; texto: string } | null>(null);
  /** Calidad de la cara detectada (0-100). Solo escanea al llegar a UMBRAL_DETECCIÓN. */
  readonly calidadPct = signal(0);
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
  private manejado = false;       // ya se registró/consultó ESTA presencia → no repite hasta que la cara se vaya
  private ultimoBox: { color: string; label: string } | null = null; // recuadro a mantener
  private ultimoCentro: { cx: number; cy: number } | null = null;     // centro de la cara manejada
  private framesSinCara = 0;      // frames seguidos sin cara → desbloquea
  private toastSeq = 0;
  private cooldown = new Map<number, number>();
  private cooldownIntento = new Map<string, number>();
  private cooldownFallback = 0;   // último llamado de fallback al servidor
  private geo: { lon: number; lat: number } | null = null;
  private poligono: string | null = null;
  /** true si se soltó la cámara por pasar la app a segundo plano (para reanudar al volver). */
  private pausadoPorFondo = false;
  /** true en la APK: usa la cámara NATIVA (camera-preview) en vez de getUserMedia web. */
  private readonly usaNativa = this.platform.isNative;
  /** Ancho/alto del frame de la cámara nativa (px), medidos una sola vez (para el recuadro). */
  private frameWNativo = 0;
  private frameHNativo = 0;
  /** Lienzo reutilizable para reducir el frame antes de ML Kit. */
  private lienzoReducir: HTMLCanvasElement | null = null;

  constructor() {
    // Nombres de puerta/dispositivo para el resumen (con :read o scanner:use).
    this.auth
      .listarSiAlguno(['puertas:read', 'scanner:use'], this.puertaService.list())
      .subscribe({ next: (d: PuertaAcceso[]) => this.resolverNombres(d, null), error: () => {} });
    this.auth
      .listarSiAlguno(['dispositivos:read', 'scanner:use'], this.dispositivoService.list())
      .subscribe({ next: (d: Dispositivo[]) => this.resolverNombres(null, d), error: () => {} });

    // Al pasar a segundo plano soltamos la cámara: retenerla en background es lo que
    // más empuja a Android a matar el proceso. Se reanuda al volver al primer plano.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
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
    if (!this.usaNativa && !this.camera.isSupported) {
      this.error.set('La cámara no está disponible en este dispositivo.');
      return;
    }
    this.error.set(null);
    this.toasts.set([]);
    this.ultimo.set(null);
    this.manejado = false;
    this.ultimoBox = null;
    this.ultimoCentro = null;
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
      // Ubicación OBLIGATORIA para fichar: es lo que permite saber DÓNDE se tomó la
      // asistencia y lo que sostiene la geocerca del backend (sin coordenadas esa
      // validación queda indeterminada y no penaliza a nadie). Se exige una primera
      // lectura ANTES de abrir la cámara: si no llega, no se ficha.
      // watchPosition por sí solo NO servía de guardia: su catch únicamente cubre el
      // alta del seguimiento, así que con el permiso denegado se seguía escaneando sin
      // ubicación y el fichaje llegaba al servidor sin coordenadas.
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
        this.geo = { lon: pos.coords.longitude, lat: pos.coords.latitude };
      } catch {
        this.geo = null;
        throw new Error(
          'Activa la ubicación para registrar asistencia. Revisa que el GPS esté ' +
          'encendido y que le hayas dado permiso de ubicación a la aplicación.',
        );
      }
      // Ya con una lectura válida, seguimiento en vivo (es un dispositivo móvil).
      try {
        this.watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (pos) => { if (pos) this.geo = { lon: pos.coords.longitude, lat: pos.coords.latitude }; });
      } catch { /* el seguimiento es opcional: ya hay una lectura inicial válida */ }

      await this.abrirCamara();
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
    void this.cerrarCamara();
    this.voz.callar();
    this.manejado = false;
    this.ultimoBox = null;
    this.ultimoCentro = null;
    this.limpiarCanvas();
    this.status.set('idle');
  }

  /**
   * App a segundo plano (o de vuelta): soltamos la cámara y paramos el bucle al
   * ocultarse para que Android no mate el proceso; se reanuda al volver.
   */
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      if (this.status() === 'detectando' && !this.pausadoPorFondo) {
        this.pausadoPorFondo = true;
        clearInterval(this.timer); // para el bucle de captura
        this.voz.callar();
        // Web: soltar getUserMedia. NATIVO: NO tocar CameraPreview aquí — el plugin
        // maneja su propio lifecycle y hacer start/stop tras onSaveInstanceState
        // CRASHEA (IllegalStateException al commitear el fragment al volver de fondo).
        if (!this.usaNativa) void this.cerrarCamara();
      }
    } else if (this.pausadoPorFondo) {
      this.pausadoPorFondo = false;
      if (this.usaNativa) {
        // El plugin reanuda la cámara solo; solo reanudamos el bucle de captura.
        if (this.status() === 'detectando') this.timer = setInterval(() => this.tick(), TICK_MS);
      } else {
        void this.reanudar();
      }
    }
  };

  /** Reabre la cámara y el bucle tras volver del segundo plano. */
  private async reanudar(): Promise<void> {
    if (this.status() !== 'detectando') return;
    try {
      await this.abrirCamara();
      this.timer = setInterval(() => this.tick(), TICK_MS);
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo reabrir la cámara.');
      this.status.set('error');
    }
  }

  /**
   * Abre la cámara: NATIVA (camera-preview, detrás del WebView) en la APK — así el
   * pipeline de video NO vive en el renderer de Chromium y deja de matarlo — o
   * getUserMedia en la web (dev). En nativo pone el fondo transparente para verla.
   */
  private async abrirCamara(): Promise<void> {
    if (this.usaNativa) {
      this.setFondoTransparente(true);
      // Sin width/height → el plugin usa pantalla completa (evita líos de DPI).
      await CameraPreview.start({
        position: 'front',
        toBack: true,
        disableAudio: true,
        lockAndroidOrientation: true,
        storeToFile: false,
      });
    } else {
      await this.camera.start(this.video()!.nativeElement);
    }
  }

  private async cerrarCamara(): Promise<void> {
    if (this.usaNativa) {
      this.setFondoTransparente(false);
      try { await CameraPreview.stop(); } catch { /* ya estaba parada */ }
    } else {
      this.camera.stop();
    }
  }

  /** Un frame como data URL JPEG, de la cámara nativa (captureSample) o del <video> web. */
  private async capturarDataUrl(quality = 0.9): Promise<string> {
    if (this.usaNativa) {
      const s = await CameraPreview.captureSample({ quality: Math.round(quality * 100) });
      return this.reducirDataUrl(`data:image/jpeg;base64,${s.value}`);
    }
    return this.camera.capture(this.video()!.nativeElement, quality);
  }

  /**
   * Reduce el frame a MAX_LADO px (en el renderer, proceso aparte) para achicar el
   * bitmap nativo que decodifica ML Kit/FaceEngine → mucha menos memoria por frame.
   */
  private reducirDataUrl(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const escala = MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight);
        if (escala >= 1) { resolve(dataUrl); return; } // ya es pequeña
        if (!this.lienzoReducir) this.lienzoReducir = document.createElement('canvas');
        const c = this.lienzoReducir;
        c.width = Math.round(img.naturalWidth * escala);
        c.height = Math.round(img.naturalHeight * escala);
        const ctx = c.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /** Ancho (px) del frame de la cámara nativa; se mide una sola vez (para calidadCara). */
  private anchoNativo(dataUrl: string): Promise<number> {
    if (this.frameWNativo) return Promise.resolve(this.frameWNativo);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.frameWNativo = img.naturalWidth || 640;
        this.frameHNativo = img.naturalHeight || 480;
        resolve(this.frameWNativo);
      };
      img.onerror = () => resolve(640);
      img.src = dataUrl;
    });
  }

  /**
   * Reusa la clase `camara-activa` de styles.scss (hecha para camera-preview toBack):
   * fondo transparente + oculta header/footer para ver la cámara nativa detrás.
   */
  private setFondoTransparente(on: boolean): void {
    document.body.classList.toggle('camara-activa', on);
  }

  private async tick(): Promise<void> {
    if (this.procesando) return;

    if (!this.usaNativa) {
      const v = this.video()?.nativeElement;
      if (!v || v.readyState < 2) return;
    }
    this.procesando = true;
    let uri: string | undefined;
    try {
      // Frame (cámara nativa o <video>) → archivo (ML Kit y FaceEngine usan archivo).
      const dataUrl = await this.capturarDataUrl(0.9);
      const w = await Filesystem.writeFile({
        path: `scan_${Date.now()}.jpg`, data: stripDataUrl(dataUrl), directory: Directory.Cache });
      uri = w.uri;
      const frameW = this.usaNativa
        ? await this.anchoNativo(dataUrl)
        : (this.video()!.nativeElement.videoWidth || 640);

      const { faces } = await FaceDetection.processImage({
        path: uri, performanceMode: PerformanceMode.Accurate,
        landmarkMode: LandmarkMode.All, contourMode: ContourMode.None, minFaceSize: 0.15 });

      // Sin cara (o varias): si se fue de verdad (2 frames), desbloquea para el siguiente.
      if (faces.length !== 1) {
        this.calidadPct.set(0);
        if (++this.framesSinCara >= FRAMES_SALIDA) this.reset();
        return;
      }
      this.framesSinCara = 0;
      const f = faces[0];
      const b = { left: f.bounds.left, top: f.bounds.top, right: f.bounds.right, bottom: f.bounds.bottom };

      const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
      // ¿La cara se movió MUCHO desde la que manejamos? = otra persona → nueva presencia.
      if (this.ultimoCentro &&
          Math.hypot(cx - this.ultimoCentro.cx, cy - this.ultimoCentro.cy) > (b.right - b.left) * 0.6) {
        this.reset();
      }
      this.ultimoCentro = { cx, cy };

      // Ya se manejó ESTA presencia (fichó local o consultó al server) → mantiene el recuadro y
      // NO vuelve a registrar/consultar hasta que la cara se vaya o cambie de persona.
      if (this.manejado) {
        if (this.ultimoBox) this.dibujarBox(b,this.ultimoBox.color, this.ultimoBox.label);
        return;
      }

      // Pose no frontal / sin landmarks → recuadro neutro, aún no reconoce.
      if (Math.abs(f.headEulerAngleY ?? 0) > MAX_POSE || Math.abs(f.headEulerAngleX ?? 0) > MAX_POSE) {
        this.calidadPct.set(0);
        this.dibujarBox(b,'#ffffff'); return;
      }
      const kps = ordenarKps(f.landmarks);
      if (!kps) { this.calidadPct.set(0); this.dibujarBox(b,'#ffffff'); return; }

      // Calidad (proxy de "detección"): NO escanea hasta el 75% (= SCORE_MIN del scanner web).
      const calidad = this.calidadCara(f, frameW);
      this.calidadPct.set(Math.round(calidad * 100));
      if (calidad < UMBRAL_DETECCION) {
        this.dibujarBox(b,'#ffffff', `${Math.round(calidad * 100)}%`);
        return;
      }
      this.dibujarBox(b,'#facc15'); // amarillo: analizando (calidad ok)

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
        this.marcar(b,'#dc2626', 'Prueba de vida');
        return;
      }

      const { embedding } = await FaceEngine.extractEmbedding({ path: uri, kps });
      const r = this.match.buscar(Float32Array.from(embedding));
      // Diagnóstico: mejor candidato local y su coseno (aunque no llegue al umbral).
      this.log.info(`local: ${r ? `${r.nombre} ${r.apellido} sim=${r.sim.toFixed(3)}` : 'sin base'} (umbral ${UMBRAL})`);

      if (r && r.sim >= UMBRAL) {
        const nombre = `${r.nombre} ${r.apellido}`;
        const pct = Math.round(r.sim * 100);
        if (!this.enCooldown(r.id)) {         // 1ª vez (o si volvió tras >8s) → registra + avisa
          this.cooldown.set(r.id, Date.now());
          const dentro = this.geo ? dentroDeArea(this.geo.lon, this.geo.lat, this.poligono) : false;
          await this.eventos.registrarAsistencia({ id_trabajador: r.id, sim: r.sim, dentro,
            lat: this.geo?.lat ?? null, lon: this.geo?.lon ?? null });
          this.subida.subirPendientes();
          this.resultado(true, 'Fichaje registrado', nombre, pct, undefined, vozAprobado(r.nombre, r.apellido));
        } else {
          this.ultimo.set({ exito: true, texto: `✓ ${nombre} · ${pct}%` }); // volvió pronto: sin doble registro
        }
        this.marcar(b,'#16a34a', `${nombre} · ${pct}%`);
      } else {
        // Local no lo reconoció.
        const hayNet = this.conexion.hayInternet();
        if (hayNet && Date.now() - this.cooldownFallback > COOLDOWN_FALLBACK_MS) {
          // UNA consulta al SERVIDOR por presencia (multi-frame + liveness activo). El server REGISTRA.
          this.cooldownFallback = Date.now();
          const online = await this.buscarEnServidor(dataUrl);
          if (online) {
            // El servidor YA registró (asistencia o intento) → el APK SOLO muestra (sin doble registro).
            if (online.acceso && online.trabajador) {
              const nombre = `${online.trabajador.nombre} ${online.trabajador.apellido}`;
              const pct = online.confianza != null ? Math.round(online.confianza * 100) : null;
              this.resultado(true, 'Fichaje (servidor)', nombre, pct, undefined,
                vozAprobado(online.trabajador.nombre, online.trabajador.apellido));
              this.marcar(b,'#16a34a', pct != null ? `${nombre} · ${pct}%` : nombre);
            } else {
              this.resultado(false, 'No reconocido', '—', null, online.mensaje ?? 'No reconocido');
              this.marcar(b,'#dc2626', 'No reconocido');
            }
            return;
          }
          // El server no respondió (error de red) → cae abajo.
        }

        if (hayNet) {
          // Con internet pero aún no se pudo consultar (dentro del cooldown/error) → espera:
          // NO marca ni registra local (para no chocar con lo que el server ya maneja).
          this.dibujarBox(b,'#facc15', 'Verificando…');
        } else {
          // OFFLINE → intento local 'desconocido' (una vez por presencia; queda "manejado").
          await this.eventos.registrarIntento({ tipo: 'desconocido', sim: r?.sim ?? null,
            lat: this.geo?.lat ?? null, lon: this.geo?.lon ?? null });
          this.subida.subirPendientes();
          this.resultado(false, 'No reconocido', '—', null, 'Rostro no reconocido');
          this.marcar(b,'#dc2626', 'No reconocido');
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
    b: { left: number; top: number; right: number; bottom: number },
    color: string, label?: string,
  ): void {
    const canvas = this.overlay()?.nativeElement;
    if (!canvas) return;
    // Lienzo lógico: en nativo, dimensiones del frame de captureSample (ya medidas);
    // en web, las del <video>. El CSS lo escala con object-fit:cover igual que el
    // preview, así el recuadro cae sobre la cara. Se espeja por código (mx) para la
    // vista selfie.
    let cw: number, ch: number;
    if (this.usaNativa) {
      if (!this.frameWNativo || !this.frameHNativo) return;
      cw = this.frameWNativo; ch = this.frameHNativo;
    } else {
      const v = this.video()?.nativeElement;
      if (!v) return;
      cw = v.videoWidth; ch = v.videoHeight;
    }
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
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

  /**
   * Fallback ONLINE: manda VARIOS frames al servidor (mismo endpoint que el scanner web).
   * Reusa el frame ya capturado + 3 más con micro-pausa → hay movimiento entre frames, lo que
   * habilita el liveness ACTIVO del servidor (además del anti-spoof) y ataja el replay de video.
   * El servidor reconoce (global+super) y REGISTRA el evento; el APK solo muestra la respuesta.
   */
  private async buscarEnServidor(primerDataUrl: string): Promise<AccesoResponse | null> {
    try {
      const blobs: Blob[] = [dataUrlToBlob(primerDataUrl)];
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 150));       // micro-pausa → movimiento entre frames
        blobs.push(dataUrlToBlob(await this.capturarDataUrl(0.9)));
      }
      const params: AccesoParams = {
        id_puerta: this.cfg.idPuerta(),
        tipo_registro: this.cfg.tipoRegistro(),
        id_dispositivo: this.cfg.idDispositivo() || undefined,
        latitud: this.geo?.lat,
        longitud: this.geo?.lon,
      };
      this.log.net(`→ POST scanner/acceso/liveness (fallback, ${blobs.length} fotos)`);
      const res = await firstValueFrom(this.scanner.acceso(params, blobs));
      this.log.ok(`← acceso=${res.acceso} ${res.trabajador ? res.trabajador.nombre : ''}`);
      return res;
    } catch (e: any) {
      this.log.warn(`fallback servidor falló: ${e?.message ?? e}`);
      return null;
    }
  }

  /** Marca ESTA presencia como manejada: mantiene el recuadro y no re-registra/consulta hasta que se vaya. */
  private marcar(
    b: { left: number; top: number; right: number; bottom: number },
    color: string, label: string,
  ): void {
    this.manejado = true;
    this.ultimoBox = { color, label };
    this.ultimoCentro = { cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 };
    this.dibujarBox(b, color, label);
  }

  /** Suelta la presencia (la cara se fue o cambió de persona): listo para la siguiente. */
  private reset(): void {
    if (!this.manejado && !this.ultimo() && !this.ultimoBox) return;
    this.manejado = false;
    this.ultimoBox = null;
    this.ultimoCentro = null;
    this.ultimo.set(null);
    this.calidadPct.set(0);
    this.limpiarCanvas();
  }

  /**
   * "Calidad" de la cara (0-1) como proxy del score de detección (ML Kit no lo da):
   * combina tamaño (qué tan cerca/grande) y qué tan frontal está. Escala fácil de calibrar.
   */
  private calidadCara(f: Face, frameW: number): number {
    const w = f.bounds.right - f.bounds.left;
    const tamano = Math.min(1, w / (frameW * 0.25)); // 1 si la cara ≥25% del ancho del frame
    const yaw = Math.abs(f.headEulerAngleY ?? 0), pitch = Math.abs(f.headEulerAngleX ?? 0);
    const frontal = Math.max(0, 1 - (yaw + pitch) / 45); // 1 frontal, 0 a ~45° combinados
    return tamano * 0.5 + frontal * 0.5;
  }

  /**
   * Empuja un toast + hint + voz (como el online). `nombreVoz` permite anunciar solo
   * primer nombre y primer apellido cuando `nombre` viene completo.
   */
  private resultado(
    exito: boolean,
    titulo: string,
    nombre: string,
    pct: number | null,
    mensaje?: string,
    nombreVoz?: string,
  ): void {
    const id = ++this.toastSeq;
    this.toasts.update((arr) => [{ id, exito, titulo, nombre, pct, mensaje }, ...arr].slice(0, 4));
    setTimeout(() => this.toasts.update((arr) => arr.filter((x) => x.id !== id)), 5000);
    this.ultimo.set({ exito, texto: exito ? `✓ ${nombre}` : `${titulo}: ${mensaje ?? nombre}` });
    // Igual que el escáner de nube: al aceptar solo el nombre; al rechazar, ni el motivo.
    this.voz.decir(exito ? (nombreVoz ?? nombre) : VOZ_RECHAZO);
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
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.detener();
  }
}
