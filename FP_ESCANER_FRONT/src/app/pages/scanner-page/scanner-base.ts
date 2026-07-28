import {
  Directive,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';

import { CameraService } from '../../service/camera';
import { EscritorioService } from '../../service/escritorio';
import { FaceBox, FaceDetectionService } from '../../service/face-detection';
import { PlatformService } from '../../service/platform';
import { ScannerConfigService } from '../../service/scanner-config';
import { VozService } from '../../service/voz';

/**
 * Lo que la voz dice al RECHAZAR. Una sola palabra, sin el motivo: en la puerta lo
 * escucha todo el mundo, y decir en voz alta "posible foto" o "rostro no reconocido"
 * expone a la persona. El motivo queda en pantalla, para quien opera.
 */
export const VOZ_RECHAZO = 'Rechazado';

/**
 * Primer nombre y primer apellido, que es lo que anuncia la voz al aceptar.
 * Los registros suelen traer nombres compuestos ("HECTOR ROLANDO VALDEZ SOTO");
 * leerlos completos hace la fila lenta y suena a lista de raya.
 */
export function nombreCorto(nombre?: string | null, apellido?: string | null): string {
  const pri = (s?: string | null) => (s ?? '').trim().split(/\s+/)[0] ?? '';
  return [pri(nombre), pri(apellido)].filter(Boolean).join(' ');
}

/** Lo que la voz dice al ACEPTAR: "Aprobado, <primer nombre> <primer apellido>." */
export function vozAprobado(nombre?: string | null, apellido?: string | null): string {
  const corto = nombreCorto(nombre, apellido);
  return corto ? `Aprobado, ${corto}.` : 'Aprobado.';
}

export type EstadoScanner = 'idle' | 'cargando' | 'detectando' | 'error';
export type EstadoCara = 'detectando' | 'capturando' | 'enviando' | 'ok' | 'rechazado';

/** Rostro con identidad estable a lo largo de los frames. */
export interface Track {
  id: number; // número de cara (1..máx configurado), estable
  box: FaceBox;
  cx: number;
  cy: number;
  misses: number;
  estableDesde: number;
  estado: EstadoCara;
}

/** Frame de la ráfaga, con el score que tenía el rostro al capturarlo. */
export interface Frame {
  dataUrl: string;
  score: number;
}

export interface Toast {
  id: number;
  exito: boolean;
  titulo: string;
  nombre: string;
  pct: number | null;
  mensaje?: string;
}

const ESTABLE_MS = 1200;
const SCORE_MIN = 0.75;
const TOTAL_CAPTURAS = 5;
const MIN_CAPTURAS = 3;
/** Frames seguidos sin verse para descartar un rostro del seguimiento. */
const MAX_MISSES = 12;
/**
 * Mínimo entre detecciones (~15 fps). El WebView emite RAF a ~60 fps; correr
 * MediaPipe en cada frame recalienta y satura la memoria de tablets de gama baja
 * (Galaxy Tab A8) hasta que Android cierra la app. 15 fps sobra para el scanner.
 */
const DETECT_INTERVAL_MS = 66;

/**
 * Motor del escáner facial, compartido por el de NUBE (`/scanner`) y el de
 * ESCRITORIO (`/kiosko-pc`): cámara, detección con MediaPipe, seguimiento de varias
 * caras a la vez, ráfaga de capturas, dibujo del overlay, toasts y voz.
 *
 * Lo ÚNICO que cambia entre los dos es a dónde se manda el rostro, que cada página
 * resuelve en `enviarCara()`. Así el kiosko de escritorio se comporta igual que el web
 * aunque por debajo fiche contra `kiosk_local` en vez de la nube.
 */
@Directive()
export abstract class ScannerBase implements OnDestroy {
  protected readonly platform = inject(PlatformService);
  protected readonly camera = inject(CameraService);
  protected readonly faceDet = inject(FaceDetectionService);
  protected readonly escritorio = inject(EscritorioService);
  protected readonly voz = inject(VozService);
  protected readonly cfg = inject(ScannerConfigService);

  readonly iconVoz = faVolumeHigh;
  readonly iconMute = faVolumeXmark;

  protected readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  protected readonly overlay = viewChild<ElementRef<HTMLCanvasElement>>('overlay');

  readonly isBrowser = this.platform.isBrowser;
  /** Resolución/fps que la cámara está entregando realmente (para el resumen). */
  readonly ajustesCamara = this.camera.ajustes;
  readonly status = signal<EstadoScanner>('idle');
  readonly error = signal<string | null>(null);
  readonly detectado = signal(false);
  readonly mejorScore = signal(0);
  readonly numRostros = signal(0);
  readonly capturando = signal(false);
  readonly enviando = signal(false);
  readonly toasts = signal<Toast[]>([]);
  /** Notificaciones simples de depuración (se quitarán después). */
  readonly notis = signal<string[]>([]);

  readonly activo = computed(() => this.status() === 'detectando');
  /** Cámara abierta (cargando o detectando): el video ocupa toda la pantalla. */
  readonly camaraAbierta = computed(
    () => this.status() === 'cargando' || this.status() === 'detectando',
  );
  /** En pantalla completa, los controles se ocultan solos y reaparecen al tocar. */
  readonly controlesVisibles = signal(true);

  /** Si es false: solo detecta en vivo (no escanea). */
  protected readonly CAPTURAR_AUTO: boolean = true;
  /** Si es false: captura pero NO envía al backend (modo prueba). */
  protected readonly ENVIAR_AL_BACKEND: boolean = true;
  /**
   * Separación entre las fotos de la ráfaga. Cuanto más espaciadas, más movimiento
   * natural (parpadeo, micro-gestos) queda entre frames, que es justo lo que mira la
   * prueba de vida; demasiado espaciadas y la persona se cansa de esperar.
   */
  protected readonly intervaloCapturaMs: number = 100;
  /**
   * Recortar alrededor del rostro incluso cuando hay una sola cara. Manda menos
   * píxeles pero casi todos útiles: el filtro de nitidez del backend mide TODA la
   * imagen, así que un frame completo con la cara pequeña se lee como "borroso"
   * aunque el rostro se vea bien.
   */
  protected readonly recortarSiempre: boolean = false;
  /** Calidad del JPEG. Comprimir de más suaviza bordes y baja la nitidez medida. */
  protected readonly calidadJpeg: number = 0.9;

  protected tracks: Track[] = [];
  private controlesTimer: ReturnType<typeof setTimeout> | undefined;
  private toastSeq = 0;
  private raf = 0;
  private running = false;
  /** Marca de la última detección, para limitar el bucle a ~15 fps. */
  private lastDetect = 0;
  /** true si se soltó la cámara por pasar la app a segundo plano (para reanudar al volver). */
  private pausadoPorFondo = false;

  constructor() {
    // Al pasar a segundo plano soltamos la cámara: retenerla en background es lo que
    // más empuja a Android a matar el proceso. Se reanuda al volver al primer plano.
    if (this.platform.isBrowser) {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  // ── Ganchos que cada página implementa ────────────────────────────────────

  /** Manda el rostro a fichar y deja el track en 'ok' o 'rechazado'. */
  protected abstract enviarCara(t: Track, frames: Frame[]): Promise<void>;

  /** Motivo por el que aún no se puede iniciar (null = todo listo). */
  protected validarInicio(): string | null {
    return null;
  }

  /** Trabajo extra tras abrir la cámara y antes de empezar a detectar (ej. ubicación). */
  protected async prepararDeteccion(): Promise<void> {}

  // ── Ciclo de vida del escaneo ─────────────────────────────────────────────

  async iniciar(): Promise<void> {
    const problema = this.validarInicio();
    if (problema) {
      this.error.set(problema);
      return;
    }
    if (!this.camera.isSupported) {
      this.error.set('La cámara no está disponible en este dispositivo.');
      return;
    }
    this.error.set(null);
    this.toasts.set([]);
    this.notis.set([]);
    this.tracks = [];
    this.status.set('cargando');

    try {
      await this.faceDet.init();
      await this.camera.start(this.video()!.nativeElement);
      await this.prepararDeteccion();
      this.status.set('detectando');
      this.running = true;
      this.lastDetect = 0;
      this.mostrarControles(); // muestra y arranca el auto-ocultado
      // En Electron: la ventana solo se va a pantalla completa mientras se ficha.
      this.escritorio.pantallaCompleta(true);
      this.raf = requestAnimationFrame(this.loop);
    } catch (e) {
      this.error.set(this.msg(e));
      this.status.set('error');
      this.escritorio.pantallaCompleta(false);
    }
  }

  detener(): void {
    this.running = false;
    this.pausadoPorFondo = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
    this.voz.callar();
    clearTimeout(this.controlesTimer);
    this.controlesVisibles.set(true);
    this.tracks = [];
    this.limpiarCanvas();
    this.escritorio.pantallaCompleta(false);
    this.status.set('idle');
  }

  /**
   * App a segundo plano (o de vuelta): soltamos la cámara al ocultarse para que
   * Android no mate el proceso, y la reabrimos al volver si estábamos escaneando.
   */
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      if (this.running) {
        this.pausadoPorFondo = true;
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.camera.stop();
        this.voz.callar();
      }
    } else if (this.pausadoPorFondo) {
      this.pausadoPorFondo = false;
      this.reanudar();
    }
  };

  /** Reabre la cámara y el bucle tras volver del segundo plano. */
  private async reanudar(): Promise<void> {
    if (this.status() !== 'detectando') return;
    try {
      await this.camera.start(this.video()!.nativeElement);
      this.running = true;
      this.lastDetect = 0;
      this.raf = requestAnimationFrame(this.loop);
    } catch (e) {
      this.error.set(this.msg(e));
      this.status.set('error');
    }
  }

  private readonly loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    // Throttle a ~15 fps: no detectamos en cada frame para no recalentar la tablet.
    const ahora = performance.now();
    if (ahora - this.lastDetect < DETECT_INTERVAL_MS) return;
    this.lastDetect = ahora;

    const v = this.video()?.nativeElement;
    if (!v || v.readyState < 2) return;

    const boxes = this.faceDet.detect(v, performance.now()).slice(0, this.cfg.maxRostros() + 2);
    this.actualizarTracks(boxes);
    this.dibujar(v);

    this.numRostros.set(this.tracks.length);
    this.mejorScore.set(Math.max(0, ...this.tracks.map((t) => t.box.score)));
    this.detectado.set(this.tracks.some((t) => t.box.score >= this.scoreMin()));
    this.capturando.set(this.tracks.some((t) => t.estado === 'capturando'));
    this.enviando.set(this.tracks.some((t) => t.estado === 'enviando'));

    // Dispara el escaneo de cada cara estable de forma independiente.
    for (const t of this.tracks) {
      if (t.estado !== 'detectando') continue;
      if (t.box.score >= this.scoreMin()) {
        if (!t.estableDesde) t.estableDesde = performance.now();
        if (this.CAPTURAR_AUTO && performance.now() - t.estableDesde >= ESTABLE_MS) {
          this.escanearCara(t);
        }
      } else {
        t.estableDesde = 0;
      }
    }
  };

  /** Empareja detecciones con tracks por cercanía (centroide); conserva el número de cada cara. */
  private actualizarTracks(boxes: FaceBox[]): void {
    const usados = new Set<number>();

    for (const t of this.tracks) {
      let best = -1;
      let bestD = Infinity;
      boxes.forEach((b, i) => {
        if (usados.has(i)) return;
        const d = Math.hypot(b.x + b.width / 2 - t.cx, b.y + b.height / 2 - t.cy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const umbral = Math.max(t.box.width, 60) * 0.8;
      if (best >= 0 && bestD <= umbral) {
        const b = boxes[best];
        usados.add(best);
        t.box = b;
        t.cx = b.x + b.width / 2;
        t.cy = b.y + b.height / 2;
        t.misses = 0;
      } else {
        t.misses++;
      }
    }

    this.tracks = this.tracks.filter((t) => t.misses <= MAX_MISSES);

    boxes.forEach((b, i) => {
      if (usados.has(i)) return;
      if (this.tracks.length >= this.cfg.maxRostros()) return;
      this.tracks.push({
        id: this.siguienteSlot(),
        box: b,
        cx: b.x + b.width / 2,
        cy: b.y + b.height / 2,
        misses: 0,
        estableDesde: 0,
        estado: 'detectando',
      });
    });
  }

  private siguienteSlot(): number {
    for (let n = 1; n <= this.cfg.maxRostros(); n++) {
      if (!this.tracks.some((t) => t.id === n)) return n;
    }
    return this.tracks.length + 1;
  }

  private dibujar(v: HTMLVideoElement): void {
    const canvas = this.overlay()?.nativeElement;
    if (!canvas) return;
    if (canvas.width !== v.videoWidth) canvas.width = v.videoWidth;
    if (canvas.height !== v.videoHeight) canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.font = 'bold 16px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';

    for (const t of this.tracks) {
      const b = t.box;
      const color = this.colorCara(t);
      const mx = canvas.width - b.x - b.width; // espejo
      let label = `Cara ${t.id} · ${Math.round(b.score * 100)}%`;
      if (t.estado === 'capturando') label += ' 📸';
      else if (t.estado === 'enviando') label += ' …';
      else if (t.estado === 'ok') label += ' ✓';
      else if (t.estado === 'rechazado') label += ' ✗';

      ctx.strokeStyle = color;
      ctx.strokeRect(mx, b.y, b.width, b.height);

      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(mx, Math.max(0, b.y - 24), tw + 12, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, mx + 6, Math.max(16, b.y - 7));
    }
  }

  private limpiarCanvas(): void {
    const canvas = this.overlay()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private colorCara(t: Track): string {
    if (t.estado === 'ok') return '#16a34a';
    if (t.estado === 'rechazado') return '#dc2626';
    return t.box.score >= this.scoreMin() ? '#245640' : '#9099a5';
  }

  /** Captura la ráfaga de una cara (recorte con margen) y la manda a fichar. */
  private async escanearCara(t: Track): Promise<void> {
    t.estado = 'capturando';
    const frames: Frame[] = [];

    for (let foto = 1; foto <= TOTAL_CAPTURAS; foto++) {
      const v = this.video()?.nativeElement;
      if (v) {
        // Varias caras → recorte obligado para aislar la que toca. Con una sola,
        // depende de la página (ver `recortarSiempre`).
        const dataUrl =
          this.tracks.length <= 1 && !this.recortarSiempre
            ? this.camera.capture(v, this.calidadJpeg)
            : (() => {
                const r = this.regionConMargen(t.box, v);
                return this.camera.captureRegion(v, r.x, r.y, r.w, r.h, this.calidadJpeg);
              })();
        frames.push({ dataUrl, score: t.box.score });
        this.notificar(
          `Cara ${t.id} · foto ${foto}/${TOTAL_CAPTURAS} · ${Math.round(t.box.score * 100)}%`,
        );
      }
      if (foto < TOTAL_CAPTURAS) await this.delay(this.intervaloCapturaMs);
    }

    if (frames.length < MIN_CAPTURAS) {
      this.notificar(`Cara ${t.id}: solo ${frames.length} capturas (mín. ${MIN_CAPTURAS}).`);
      t.estado = 'detectando';
      t.estableDesde = 0;
      return;
    }

    if (!this.ENVIAR_AL_BACKEND) {
      t.estado = 'ok';
      this.toastPush({
        cara: t.id,
        exito: true,
        nombre: 'Modo prueba',
        pct: Math.round(this.scoreMaximo(frames) * 100),
      });
      return;
    }

    t.estado = 'enviando';
    // Se entregan en ORDEN DE CAPTURA: la prueba de vida compara los frames entre sí,
    // así que la secuencia temporal es parte de la información.
    await this.enviarCara(t, frames);
  }

  /** Mejor score de la ráfaga (para mostrar el porcentaje cuando el backend no manda uno). */
  protected scoreMaximo(frames: Frame[]): number {
    return frames.reduce((m, f) => (f.score > m ? f.score : m), 0);
  }

  /** Recorte del rostro con margen alrededor (para que el backend lo detecte bien). */
  private regionConMargen(
    b: FaceBox,
    v: HTMLVideoElement,
  ): { x: number; y: number; w: number; h: number } {
    const padX = b.width * 0.6;
    const padY = b.height * 0.7;
    const x = Math.max(0, b.x - padX);
    const y = Math.max(0, b.y - padY);
    const w = Math.min(v.videoWidth - x, b.width + padX * 2);
    const h = Math.min(v.videoHeight - y, b.height + padY * 2);
    return { x, y, w, h };
  }

  /** Muestra el resultado de una cara (toast + voz). */
  protected toastPush(t: {
    cara: number;
    exito: boolean;
    nombre: string;
    pct: number | null;
    mensaje?: string;
    frase?: string;
    titulo?: string;
  }): void {
    const id = ++this.toastSeq;
    const toast: Toast = {
      id,
      exito: t.exito,
      titulo: t.titulo ?? `Cara ${t.cara}: ${t.exito ? 'Exitoso' : 'Rechazado'}`,
      nombre: t.nombre,
      pct: t.pct,
      mensaje: t.mensaje,
    };
    this.toasts.update((arr) => [toast, ...arr]);
    setTimeout(() => this.toasts.update((arr) => arr.filter((x) => x.id !== id)), 5000);

    if (t.frase) this.voz.decir(t.frase); // no-op si la voz está silenciada
  }

  /** Score mínimo para aceptar un rostro: más bajo en alcance 'largo'. */
  protected scoreMin(): number {
    return this.cfg.alcance() === 'largo' ? 0.55 : SCORE_MIN;
  }

  /** Activa/silencia la voz; al silenciar corta lo que se esté diciendo. */
  toggleVoz(): void {
    const activa = !this.voz.activa();
    this.voz.activa.set(activa);
    if (!activa) this.voz.callar();
  }

  /**
   * Muestra los controles y reinicia el temporizador para volver a ocultarlos
   * (solo en pantalla completa). Se llama al tocar el video.
   */
  mostrarControles(): void {
    this.controlesVisibles.set(true);
    clearTimeout(this.controlesTimer);
    if (this.camaraAbierta()) {
      this.controlesTimer = setTimeout(() => this.controlesVisibles.set(false), 3500);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected notificar(msg: string): void {
    console.log('[scanner]', msg);
    this.notis.update((arr) => [msg, ...arr].slice(0, 20));
  }

  ngOnDestroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
    clearTimeout(this.controlesTimer);
    this.escritorio.pantallaCompleta(false); // salir de la página nunca deja la ventana atrapada
    if (this.platform.isBrowser) {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  protected msg(e: unknown): string {
    if (e instanceof Error) return e.message;
    const err = e as { error?: { detail?: string }; message?: string };
    return err?.error?.detail ?? err?.message ?? 'Ocurrió un error inesperado.';
  }
}
