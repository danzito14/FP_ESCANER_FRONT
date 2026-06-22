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
import { firstValueFrom } from 'rxjs';

import { Dispositivo } from '../../core/interfaces/dispositivo';
import { AccesoParams, AccesoResponse } from '../../core/interfaces/escaneo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { AuthService } from '../../service/auth';
import { CameraService, dataUrlToBlob } from '../../service/camera';
import { DispositivoService } from '../../service/dispositivo';
import { ScannerService } from '../../service/escaneo';
import { FaceBox, FaceDetectionService } from '../../service/face-detection';
import { GeolocationService } from '../../service/geolocation';
import { PlatformService } from '../../service/platform';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { ScannerConfigService } from '../../service/scanner-config';
import { VozService } from '../../service/voz';

type Estado = 'idle' | 'cargando' | 'detectando' | 'error';
type EstadoCara = 'detectando' | 'capturando' | 'enviando' | 'ok' | 'rechazado';

const ESTABLE_MS = 1200;
const SCORE_MIN = 0.75;
const TOTAL_CAPTURAS = 5;
const MIN_CAPTURAS = 3;
const INTERVALO_MS = 100;
/** Frames seguidos sin verse para descartar un rostro del seguimiento. */
const MAX_MISSES = 12;

/** Rostro con identidad estable a lo largo de los frames. */
interface Track {
  id: number; // número de cara (1..máx configurado), estable
  box: FaceBox;
  cx: number;
  cy: number;
  misses: number;
  estableDesde: number;
  estado: EstadoCara;
  resultado?: AccesoResponse;
}

interface Toast {
  id: number;
  exito: boolean;
  titulo: string;
  nombre: string;
  pct: number | null;
  mensaje?: string;
}

@Component({
  selector: 'app-scanner-page',
  imports: [DecimalPipe, RouterLink, FaIconComponent],
  templateUrl: './scanner-page.html',
  styleUrl: './scanner-page.scss',
})
export class ScannerPage implements OnDestroy {
  private readonly platform = inject(PlatformService);
  private readonly camera = inject(CameraService);
  protected readonly faceDet = inject(FaceDetectionService);
  private readonly geo = inject(GeolocationService);
  private readonly scanner = inject(ScannerService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly dispositivoService = inject(DispositivoService);
  private readonly auth = inject(AuthService);
  protected readonly voz = inject(VozService);
  protected readonly cfg = inject(ScannerConfigService);

  readonly iconVoz = faVolumeHigh;
  readonly iconMute = faVolumeXmark;

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild<ElementRef<HTMLCanvasElement>>('overlay');

  readonly isBrowser = this.platform.isBrowser;
  readonly puertas = signal<PuertaAcceso[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);

  readonly status = signal<Estado>('idle');
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
  private controlesTimer: ReturnType<typeof setTimeout> | undefined;

  /** Si es false: solo detecta en vivo (no escanea). */
  private readonly CAPTURAR_AUTO: boolean = true;
  /** Si es false: captura pero NO envía al backend (modo prueba). */
  private readonly ENVIAR_AL_BACKEND: boolean = true;

  private tracks: Track[] = [];
  private lat?: number;
  private lng?: number;
  private toastSeq = 0;
  private raf = 0;
  private running = false;

  constructor() {
    // Solo para el resumen (nombres). Carga con :read o con scanner:use.
    this.auth
      .listarSiAlguno(['puertas:read', 'scanner:use'], this.puertaService.list())
      .subscribe({ next: (data) => this.puertas.set(data), error: () => {} });
    this.auth
      .listarSiAlguno(['dispositivos:read', 'scanner:use'], this.dispositivoService.list())
      .subscribe({ next: (data) => this.dispositivos.set(data), error: () => {} });
  }

  /** Nombre de la puerta configurada (para el resumen). */
  puertaNombre(): string {
    const id = this.cfg.idPuerta();
    if (!id) return '';
    return this.puertas().find((p) => p.id_puerta === id)?.nombre_puerta ?? `#${id}`;
  }

  /** Nombre del dispositivo configurado (para el resumen). */
  dispositivoNombre(): string {
    const id = this.cfg.idDispositivo();
    if (!id) return '';
    return this.dispositivos().find((d) => d.id_dispositivo === id)?.nombre_dispositivo ?? `#${id}`;
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
    this.notis.set([]);
    this.tracks = [];
    this.status.set('cargando');

    try {
      await this.faceDet.init();
      await this.camera.start(this.video()!.nativeElement);
      await this.cargarUbicacion();
      this.status.set('detectando');
      this.running = true;
      this.mostrarControles(); // muestra y arranca el auto-ocultado
      this.raf = requestAnimationFrame(this.loop);
    } catch (e) {
      this.error.set(this.msg(e));
      this.status.set('error');
    }
  }

  detener(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
    this.voz.callar();
    clearTimeout(this.controlesTimer);
    this.controlesVisibles.set(true);
    this.tracks = [];
    this.status.set('idle');
  }

  private async cargarUbicacion(): Promise<void> {
    try {
      const pos = await this.geo.getCurrentPosition();
      this.lat = pos.lat;
      this.lng = pos.lng;
    } catch {
      this.lat = undefined;
      this.lng = undefined;
    }
  }

  private readonly loop = (): void => {
    if (!this.running) return;
    const v = this.video()?.nativeElement;

    if (v && v.readyState >= 2) {
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
    }

    this.raf = requestAnimationFrame(this.loop);
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

  private colorCara(t: Track): string {
    if (t.estado === 'ok') return '#16a34a';
    if (t.estado === 'rechazado') return '#dc2626';
    return t.box.score >= this.scoreMin() ? '#245640' : '#9099a5';
  }

  /** Captura la ráfaga de una cara (recorte con margen) y la envía al liveness. */
  private async escanearCara(t: Track): Promise<void> {
    t.estado = 'capturando';
    const frames: { dataUrl: string; score: number }[] = [];

    for (let foto = 1; foto <= TOTAL_CAPTURAS; foto++) {
      const v = this.video()?.nativeElement;
      if (v) {
        // Una sola cara → frame completo (probado). Varias → recorte con margen para aislarla.
        const dataUrl =
          this.tracks.length <= 1
            ? this.camera.capture(v)
            : (() => {
                const r = this.regionConMargen(t.box, v);
                return this.camera.captureRegion(v, r.x, r.y, r.w, r.h);
              })();
        frames.push({ dataUrl, score: t.box.score });
        this.notificar(`Cara ${t.id} · foto ${foto}/${TOTAL_CAPTURAS} · ${Math.round(t.box.score * 100)}%`);
      }
      if (foto < TOTAL_CAPTURAS) await this.delay(INTERVALO_MS);
    }

    const orden = frames.sort((a, b) => b.score - a.score).slice(0, TOTAL_CAPTURAS);
    const scoreMejor = orden[0]?.score ?? t.box.score;

    if (orden.length < MIN_CAPTURAS) {
      this.notificar(`Cara ${t.id}: solo ${orden.length} capturas (mín. ${MIN_CAPTURAS}).`);
      t.estado = 'detectando';
      t.estableDesde = 0;
      return;
    }

    if (!this.ENVIAR_AL_BACKEND) {
      t.estado = 'ok';
      this.toastPush(t.id, { acceso: true, mensaje: 'Modo prueba', trabajador: null, id_escaneo: 0, estado_registro: 'prueba' }, scoreMejor);
      return;
    }

    t.estado = 'enviando';
    try {
      const params: AccesoParams = {
        id_puerta: this.cfg.idPuerta(),
        tipo_registro: this.cfg.tipoRegistro(),
        id_dispositivo: this.cfg.idDispositivo() || undefined,
        latitud: this.lat,
        longitud: this.lng,
      };
      const blobs = orden.map((f) => dataUrlToBlob(f.dataUrl));
      const res = await firstValueFrom(this.scanner.acceso(params, blobs));
      t.resultado = res;
      t.estado = res.acceso ? 'ok' : 'rechazado';
      this.toastPush(t.id, res, scoreMejor);
    } catch (e) {
      t.estado = 'rechazado';
      this.notificar(`Cara ${t.id} error: ${this.msg(e)}`);
      this.toastPush(t.id, { acceso: false, mensaje: this.msg(e), trabajador: null, id_escaneo: null, estado_registro: 'error' }, scoreMejor);
    }
  }

  /** Recorte del rostro con margen alrededor (para que el backend lo detecte bien). */
  private regionConMargen(b: FaceBox, v: HTMLVideoElement): { x: number; y: number; w: number; h: number } {
    const padX = b.width * 0.6;
    const padY = b.height * 0.7;
    const x = Math.max(0, b.x - padX);
    const y = Math.max(0, b.y - padY);
    const w = Math.min(v.videoWidth - x, b.width + padX * 2);
    const h = Math.min(v.videoHeight - y, b.height + padY * 2);
    return { x, y, w, h };
  }

  private toastPush(cara: number, res: AccesoResponse, scoreFallback: number): void {
    const id = ++this.toastSeq;
    const nombre = res.trabajador
      ? `${res.trabajador.nombre} ${res.trabajador.apellido}`
      : 'No reconocido';
    const conf = res.confianza != null ? res.confianza : scoreFallback;
    const toast: Toast = {
      id,
      exito: res.acceso,
      titulo: `Cara ${cara}: ${res.acceso ? 'Exitoso' : 'Rechazado'}`,
      nombre,
      pct: conf != null ? Math.round(conf * 100) : null,
      mensaje: res.mensaje,
    };
    this.toasts.update((arr) => [toast, ...arr]);
    setTimeout(() => this.toasts.update((arr) => arr.filter((x) => x.id !== id)), 5000);

    

    const frase = res.acceso
      ? `Aprobado, ${nombre}.`
      : res.trabajador
        ? `Denegado, ${nombre}.`
        : 'Acceso denegado. Rostro no reconocido.';
    this.voz.decir(frase); // no-op si la voz está silenciada
  }

  /** Score mínimo para aceptar un rostro: más bajo en alcance 'largo'. */
  private scoreMin(): number {
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

  private notificar(msg: string): void {
    console.log('[scanner]', msg);
    this.notis.update((arr) => [msg, ...arr].slice(0, 20));
  }

  ngOnDestroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
    clearTimeout(this.controlesTimer);
  }

  private msg(e: unknown): string {
    if (e instanceof Error) return e.message;
    const err = e as { error?: { detail?: string }; message?: string };
    return err?.error?.detail ?? err?.message ?? 'Ocurrió un error inesperado.';
  }
}
