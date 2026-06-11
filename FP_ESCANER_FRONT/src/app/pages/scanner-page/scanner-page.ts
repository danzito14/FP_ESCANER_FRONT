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
import { firstValueFrom } from 'rxjs';

import { TipoRegistro } from '../../core/interfaces/common';
import { Dispositivo } from '../../core/interfaces/dispositivo';
import { AccesoParams, AccesoResponse } from '../../core/interfaces/escaneo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { CameraService, dataUrlToBlob } from '../../service/camera';
import { DispositivoService } from '../../service/dispositivo';
import { ScannerService } from '../../service/escaneo';
import { FaceBox, FaceDetectionService } from '../../service/face-detection';
import { GeolocationService } from '../../service/geolocation';
import { PlatformService } from '../../service/platform';
import { PuertaAccesoService } from '../../service/puerta-acceso';

type Estado = 'idle' | 'cargando' | 'detectando' | 'error';

/** Tiempo (ms) que el rostro debe mantenerse estable antes de capturar. */
const ESTABLE_MS = 1200;
/** Score de detección mínimo aceptable (MediaPipe, 0–1). */
const SCORE_MIN = 0.75;
/** Máximo de rostros a considerar simultáneamente. */
const MAX_ROSTROS = 3;
/** Capturas por ráfaga (el backend espera entre 3 y 5). */
const TOTAL_CAPTURAS = 5;
/** Mínimo de capturas válidas para enviar. */
const MIN_CAPTURAS = 3;
/** Milisegundos entre captura y captura. */
const INTERVALO_MS = 600;

interface Frame {
  dataUrl: string;
  score: number;
}

@Component({
  selector: 'app-scanner-page',
  imports: [DecimalPipe],
  templateUrl: './scanner-page.html',
  styleUrl: './scanner-page.scss',
})
export class ScannerPage implements OnDestroy {
  private readonly platform = inject(PlatformService);
  private readonly camera = inject(CameraService);
  private readonly faceDet = inject(FaceDetectionService);
  private readonly geo = inject(GeolocationService);
  private readonly scanner = inject(ScannerService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly dispositivoService = inject(DispositivoService);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild<ElementRef<HTMLCanvasElement>>('overlay');

  readonly isBrowser = this.platform.isBrowser;
  readonly puertas = signal<PuertaAcceso[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);
  readonly idPuerta = signal(0);
  readonly idDispositivo = signal(0);
  readonly tipoRegistro = signal<TipoRegistro>('entrada');

  readonly status = signal<Estado>('idle');
  readonly error = signal<string | null>(null);
  readonly progreso = signal(0);
  readonly detectado = signal(false);
  readonly mejorScore = signal(0);
  readonly numRostros = signal(0);
  readonly capturando = signal(false);
  readonly enviando = signal(false);
  /** Toast del resultado, encima del video (se auto-oculta). */
  readonly toast = signal<{ exito: boolean; titulo: string; nombre: string; pct: number | null } | null>(
    null,
  );
  /** Notificaciones simples de depuración (se quitarán después). */
  readonly notis = signal<string[]>([]);

  private toastTimer = 0;

  readonly activo = computed(() => this.status() === 'detectando');

  /** Si es false: solo detecta en vivo (no captura). */
  private readonly CAPTURAR_AUTO: boolean = true;
  /** Si es false: captura pero NO envía al backend (modo prueba). */
  private readonly ENVIAR_AL_BACKEND: boolean = true;

  /** Frames del rostro principal capturados en la ráfaga. */
  private frames: Frame[] = [];
  private bloqueado = false;
  private raf = 0;
  private running = false;
  private estableDesde = 0;

  constructor() {
    this.puertaService.list().subscribe({
      next: (data) => this.puertas.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
    this.dispositivoService.list().subscribe({
      next: (data) => this.dispositivos.set(data),
      error: (e) => this.error.set(this.msg(e)),
    });
  }

  onPuerta(e: Event): void {
    this.idPuerta.set(+(e.target as HTMLSelectElement).value);
  }

  onDispositivo(e: Event): void {
    this.idDispositivo.set(+(e.target as HTMLSelectElement).value);
  }

  onTipo(e: Event): void {
    this.tipoRegistro.set((e.target as HTMLSelectElement).value as TipoRegistro);
  }

  async iniciar(): Promise<void> {
    if (!this.idPuerta()) {
      this.error.set('Selecciona una puerta antes de iniciar.');
      return;
    }
    if (!this.camera.isSupported) {
      this.error.set('La cámara no está disponible en este dispositivo.');
      return;
    }
    this.error.set(null);
    this.toast.set(null);
    this.progreso.set(0);
    this.bloqueado = false;
    this.frames = [];
    this.notis.set([]);
    this.status.set('cargando');

    try {
      await this.faceDet.init();
      await this.camera.start(this.video()!.nativeElement);
      this.status.set('detectando');
      this.estableDesde = 0;
      this.running = true;
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
    this.status.set('idle');
    this.progreso.set(0);
  }

  private readonly loop = (): void => {
    if (!this.running) return;
    const v = this.video()?.nativeElement;

    if (v && v.readyState >= 2) {
      const boxes = this.faceDet
        .detect(v, performance.now())
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ROSTROS);
      this.dibujar(boxes, v);

      this.numRostros.set(boxes.length);
      this.mejorScore.set(boxes[0]?.score ?? 0);

      const aceptable = boxes.length > 0 && boxes[0].score >= SCORE_MIN;
      if (aceptable) {
        this.detectado.set(true);
        if (!this.estableDesde) this.estableDesde = performance.now();
        const held = performance.now() - this.estableDesde;
        this.progreso.set(Math.min(100, Math.round((held / ESTABLE_MS) * 100)));
        if (this.CAPTURAR_AUTO && held >= ESTABLE_MS && !this.capturando() && !this.bloqueado) {
          this.iniciarSecuencia(v);
        }
      } else {
        this.detectado.set(false);
        this.estableDesde = 0;
        this.progreso.set(0);
        this.bloqueado = false; // el rostro salió: permite una nueva ráfaga
      }
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  private dibujar(boxes: FaceBox[], v: HTMLVideoElement): void {
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

    boxes.forEach((b, i) => {
      const aceptable = b.score >= SCORE_MIN;
      const color = aceptable ? '#16a34a' : '#9099a5';
      const mx = canvas.width - b.x - b.width; // espejo, para alinear con el video
      const label = `Cara ${i + 1} · ${Math.round(b.score * 100)}%`;

      ctx.strokeStyle = color;
      ctx.strokeRect(mx, b.y, b.width, b.height);

      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(mx, Math.max(0, b.y - 24), tw + 12, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, mx + 6, Math.max(16, b.y - 7));
    });
  }

  /** Ráfaga: 5 capturas del rostro principal, 300 ms entre cada una. */
  private async iniciarSecuencia(v: HTMLVideoElement): Promise<void> {
    this.capturando.set(true);
    this.bloqueado = true;
    this.frames = [];
    this.notificar('— Iniciando capturas —');

    for (let foto = 1; foto <= TOTAL_CAPTURAS; foto++) {
      const face = this.faceDet
        .detect(v, performance.now())
        .sort((a, b) => b.score - a.score)
        .filter((f) => f.score >= SCORE_MIN)[0];

      if (face) {
        // Frame completo (no recorte): el backend detecta el rostro y mide liveness.
        const dataUrl = this.camera.capture(v);
        this.frames.push({ dataUrl, score: face.score });
        this.notificar(`Foto ${foto}/${TOTAL_CAPTURAS} · ${Math.round(face.score * 100)}% ✓`);
      } else {
        this.notificar(`Foto ${foto}/${TOTAL_CAPTURAS}: sin rostro válido`);
      }

      if (foto < TOTAL_CAPTURAS) await this.delay(INTERVALO_MS);
    }

    this.capturando.set(false);
    await this.enviarLiveness();
  }

  /** Envía 3–5 capturas (de mayor a menor score) sin interrumpir la cámara. */
  private async enviarLiveness(): Promise<void> {
    const frames = [...this.frames].sort((a, b) => b.score - a.score).slice(0, TOTAL_CAPTURAS);
    const scoreMejor = frames[0]?.score ?? this.mejorScore();

    if (frames.length < MIN_CAPTURAS) {
      this.notificar(`Solo ${frames.length} capturas válidas (mín. ${MIN_CAPTURAS}). Reintenta.`);
      return; // sigue detectando; se desbloquea cuando el rostro salga
    }

    if (!this.ENVIAR_AL_BACKEND) {
      this.mostrarToast({
        acceso: true,
        mensaje: 'Modo prueba',
        trabajador: null,
        id_escaneo: 0,
        estado_registro: 'prueba',
      }, scoreMejor);
      return;
    }

    let latitud: number | undefined;
    let longitud: number | undefined;
    try {
      const pos = await this.geo.getCurrentPosition();
      latitud = pos.lat;
      longitud = pos.lng;
    } catch {
      // sin ubicación: el backend decide
    }

    this.enviando.set(true);
    try {
      const params: AccesoParams = {
        id_puerta: this.idPuerta(),
        tipo_registro: this.tipoRegistro(),
        id_dispositivo: this.idDispositivo() || undefined,
        latitud,
        longitud,
      };
      const blobs = frames.map((f) => dataUrlToBlob(f.dataUrl));
      this.notificar(`Enviando ${blobs.length} fotos…`);

      const res = await firstValueFrom(this.scanner.acceso(params, blobs));
      this.mostrarToast(res, scoreMejor);
    } catch (e) {
      this.notificar(`Error: ${this.msg(e)}`);
      this.toastTimerReset({ exito: false, titulo: 'Error', nombre: this.msg(e), pct: null });
    } finally {
      this.enviando.set(false);
    }
  }

  /** Muestra el resultado como toast por encima del video (auto-oculta). */
  private mostrarToast(res: AccesoResponse, scoreDeteccion: number): void {
    const nombre = res.trabajador
      ? `${res.trabajador.nombre} ${res.trabajador.apellido}`
      : 'No reconocido';
    const conf = res.confianza != null ? res.confianza : scoreDeteccion;
    this.toastTimerReset({
      exito: res.acceso,
      titulo: res.acceso ? 'Exitoso' : 'Rechazado',
      nombre,
      pct: conf != null ? Math.round(conf * 100) : null,
    });
  }

  private toastTimerReset(t: { exito: boolean; titulo: string; nombre: string; pct: number | null }): void {
    this.toast.set(t);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 5000) as unknown as number;
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
    clearTimeout(this.toastTimer);
    this.camera.stop();
  }

  private msg(e: unknown): string {
    if (e instanceof Error) return e.message;
    const err = e as { error?: { detail?: string }; message?: string };
    return err?.error?.detail ?? err?.message ?? 'Ocurrió un error inesperado.';
  }
}
