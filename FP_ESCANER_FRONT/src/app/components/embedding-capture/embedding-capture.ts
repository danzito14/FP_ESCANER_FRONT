import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { CameraService, dataUrlToBlob } from '../../service/camera';
import { EmbeddingService } from '../../service/embedding';
import { FaceBox, FaceDetectionService } from '../../service/face-detection';

type Estado = 'cargando' | 'preview' | 'capturando' | 'listo' | 'enviando' | 'ok' | 'error';

const SCORE_MIN = 0.75;
const TOTAL_FOTOS = 10;
const INTERVALO_MS = 120;

interface Frame {
  dataUrl: string;
  score: number;
}

interface Resumen {
  titulo: string;
  calidad: number | null;
  modelo?: string | null;
  mensaje?: string;
}

@Component({
  selector: 'app-embedding-capture',
  imports: [DecimalPipe],
  templateUrl: './embedding-capture.html',
  styleUrl: './embedding-capture.scss',
})
export class EmbeddingCapture implements OnDestroy {
  private readonly camera = inject(CameraService);
  private readonly faceDet = inject(FaceDetectionService);
  private readonly embeddingService = inject(EmbeddingService);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild<ElementRef<HTMLCanvasElement>>('overlay');

  readonly idTrabajador = input.required<number>();
  readonly nombre = input<string>('');
  /** 'registrar' (POST, nuevo) o 'actualizar' (PUT, reemplaza el existente). */
  readonly modo = input<'registrar' | 'actualizar'>('registrar');
  readonly done = output<void>();
  readonly cancel = output<void>();

  readonly status = signal<Estado>('cargando');
  readonly progreso = signal(0);
  readonly error = signal<string | null>(null);
  readonly resumen = signal<Resumen | null>(null);
  readonly mejorImg = signal<string | null>(null);
  /** La foto proviene de un archivo (no de la cámara) → no se espeja en el preview. */
  readonly desdeArchivo = signal(false);

  private frames: Frame[] = [];
  private running = false;
  private raf = 0;
  private ultimaCaptura = 0;

  constructor() {
    // Abre la cámara en cuanto se monta, para ver/acomodar a la persona.
    afterNextRender(() => this.abrirCamara());
  }

  /** Abre la cámara y muestra el preview en vivo (sin capturar todavía). */
  async abrirCamara(): Promise<void> {
    this.error.set(null);
    this.resumen.set(null);
    this.mejorImg.set(null);
    this.desdeArchivo.set(false);
    this.progreso.set(0);
    this.frames = [];
    cancelAnimationFrame(this.raf);

    if (!this.camera.isSupported) {
      this.error.set('La cámara no está disponible en este dispositivo.');
      this.status.set('error');
      return;
    }

    this.status.set('cargando');
    try {
      await this.faceDet.init();
      await this.camera.start(this.video()!.nativeElement);
      this.status.set('preview');
      this.running = true;
      this.raf = requestAnimationFrame(this.loop);
    } catch (e) {
      this.error.set(this.msg(e));
      this.status.set('error');
      this.camera.stop();
    }
  }

  /** Carga una foto desde un archivo en vez de la cámara. */
  onArchivo(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Selecciona una imagen JPEG o PNG.');
      return;
    }
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
    this.error.set(null);

    const reader = new FileReader();
    reader.onload = () => {
      this.desdeArchivo.set(true);
      this.mejorImg.set(reader.result as string);
      this.status.set('listo');
    };
    reader.onerror = () => this.error.set('No se pudo leer la imagen.');
    reader.readAsDataURL(file);
  }

  /** El usuario decide cuándo empezar la ráfaga de 10 fotos. */
  comenzar(): void {
    if (this.status() !== 'preview') return;
    this.frames = [];
    this.progreso.set(0);
    this.ultimaCaptura = 0;
    this.status.set('capturando');
  }

  private readonly loop = (): void => {
    if (!this.running) return;
    const v = this.video()?.nativeElement;

    if (v && v.readyState >= 2) {
      const face = this.faceDet
        .detect(v, performance.now())
        .sort((a, b) => b.score - a.score)[0];
      this.dibujar(face, v);

      if (this.status() === 'capturando') {
        const now = performance.now();
        if (face && face.score >= SCORE_MIN && now - this.ultimaCaptura >= INTERVALO_MS) {
          this.frames.push({ dataUrl: this.camera.capture(v), score: face.score });
          this.ultimaCaptura = now;
          this.progreso.set(Math.round((this.frames.length / TOTAL_FOTOS) * 100));
          if (this.frames.length >= TOTAL_FOTOS) {
            this.finalizarCaptura();
            return;
          }
        }
      }
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  private finalizarCaptura(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();

    if (this.frames.length === 0) {
      this.error.set('No se detectó un rostro claro. Inténtalo de nuevo.');
      this.status.set('error');
      return;
    }
    const mejor = [...this.frames].sort((a, b) => b.score - a.score)[0];
    this.mejorImg.set(mejor.dataUrl);
    this.status.set('listo');
  }

  /** Sube la mejor foto al backend (lo dispara el usuario). */
  async subir(): Promise<void> {
    const img = this.mejorImg();
    if (!img) return;
    this.status.set('enviando');
    const blob = dataUrlToBlob(img);
    const id = this.idTrabajador();
    try {
      if (this.modo() === 'actualizar') {
        const r = await firstValueFrom(this.embeddingService.reemplazarFoto(id, blob));
        this.resumen.set({
          titulo: '✓ Rostro actualizado',
          calidad: this.aNumero(r.calidad_embedding),
          modelo: r.modelo_ia,
        });
      } else {
        const r = await firstValueFrom(this.embeddingService.registrarFoto(id, blob));
        this.resumen.set({
          titulo: '✓ Rostro registrado',
          calidad: r.calidad ?? null,
          modelo: r.modelo_ia,
          mensaje: r.mensaje,
        });
      }
      this.status.set('ok');
    } catch (e) {
      this.error.set(this.msg(e));
      this.status.set('error');
    }
  }

  private aNumero(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private dibujar(face: FaceBox | undefined, v: HTMLVideoElement): void {
    const canvas = this.overlay()?.nativeElement;
    if (!canvas) return;
    if (canvas.width !== v.videoWidth) canvas.width = v.videoWidth;
    if (canvas.height !== v.videoHeight) canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!face) return;
    const color = face.score >= SCORE_MIN ? '#245640' : '#9099a5';
    const mx = canvas.width - face.x - face.width; // espejo
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.strokeRect(mx, face.y, face.width, face.height);
  }

  terminar(): void {
    this.done.emit();
  }

  cancelar(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
    this.cancel.emit();
  }

  ngOnDestroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
  }

  private msg(e: unknown): string {
    if (e instanceof Error) return e.message;
    const err = e as { error?: { detail?: string }; message?: string };
    return err?.error?.detail ?? err?.message ?? 'Ocurrió un error inesperado.';
  }
}
