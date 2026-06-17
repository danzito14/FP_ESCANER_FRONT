import { Injectable, inject, signal } from '@angular/core';
import { Detection, FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

import { AlcanceDeteccion, ScannerConfigService } from './scanner-config';

/** Recuadro de un rostro detectado (en píxeles del video). */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
/** Modelo de corto alcance (oficial para la API Tasks). */
const MODEL_SHORT =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
/**
 * Modelo de rango completo (~5 m). Es el de la solución legacy; puede que la API
 * Tasks no lo acepte → si falla se cae al short-range automáticamente.
 */
const MODEL_FULL =
  'https://storage.googleapis.com/mediapipe-assets/face_detection_full_range_sparse.tflite';

/**
 * Detección de rostros en el navegador con MediaPipe (solo detecta, no identifica).
 * Los WASM y el modelo se cargan desde CDN; para la APK conviene empaquetarlos
 * como assets y cambiar WASM_URL / MODEL_URL a rutas locales.
 */
@Injectable({ providedIn: 'root' })
export class FaceDetectionService {
  private readonly cfg = inject(ScannerConfigService);
  private detector: FaceDetector | null = null;
  private loading: Promise<void> | null = null;
  private alcanceUsado: AlcanceDeteccion | null = null;
  /** true si en 'largo' se logró cargar el modelo full-range; false = se usó short. */
  readonly modeloLargoActivo = signal(false);

  /**
   * Carga el modelo (idempotente). Si cambió el alcance, lo recrea:
   * - 'largo': intenta el modelo full-range (~5 m) y baja la confianza; si la API
   *   no acepta ese modelo, cae al short-range (con la confianza baja igual).
   * - 'corto': modelo short-range con confianza normal.
   */
  init(): Promise<void> {
    const alcance = this.cfg.alcance();
    if (this.detector && this.alcanceUsado === alcance) return Promise.resolve();
    if (this.loading && this.alcanceUsado === alcance) return this.loading;

    this.detector?.close();
    this.detector = null;
    this.alcanceUsado = alcance;
    const minConf = alcance === 'largo' ? 0.3 : 0.5;
    // En 'largo' intenta full-range primero; si no carga, usa short-range.
    const modelos = alcance === 'largo' ? [MODEL_FULL, MODEL_SHORT] : [MODEL_SHORT];

    this.loading = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      for (const url of modelos) {
        const det = await this.crear(vision, url, minConf);
        if (det) {
          this.detector = det;
          this.modeloLargoActivo.set(alcance === 'largo' && url === MODEL_FULL);
          return;
        }
      }
    })();

    return this.loading;
  }

  /** Intenta crear el detector con un modelo (GPU y luego CPU); null si falla. */
  private async crear(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    modelUrl: string,
    minConf: number,
  ): Promise<FaceDetector | null> {
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        return await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelUrl, delegate },
          runningMode: 'VIDEO',
          minDetectionConfidence: minConf,
        });
      } catch {
        // Prueba el siguiente delegate/modelo.
      }
    }
    return null;
  }

  /** Detecta rostros en el frame de video actual. `timestamp` en ms (performance.now()). */
  detect(video: HTMLVideoElement, timestamp: number): FaceBox[] {
    if (!this.detector) return [];
    const result = this.detector.detectForVideo(video, timestamp);
    return result.detections.map((d: Detection) => {
      const bb = d.boundingBox!;
      return {
        x: bb.originX,
        y: bb.originY,
        width: bb.width,
        height: bb.height,
        score: d.categories?.[0]?.score ?? 0,
      };
    });
  }

  close(): void {
    this.detector?.close();
    this.detector = null;
    this.loading = null;
  }
}
