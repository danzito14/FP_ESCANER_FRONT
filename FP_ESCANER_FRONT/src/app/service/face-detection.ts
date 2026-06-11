import { Injectable } from '@angular/core';
import { Detection, FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

/** Recuadro de un rostro detectado (en píxeles del video). */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

/**
 * Detección de rostros en el navegador con MediaPipe (solo detecta, no identifica).
 * Los WASM y el modelo se cargan desde CDN; para la APK conviene empaquetarlos
 * como assets y cambiar WASM_URL / MODEL_URL a rutas locales.
 */
@Injectable({ providedIn: 'root' })
export class FaceDetectionService {
  private detector: FaceDetector | null = null;
  private loading: Promise<void> | null = null;

  /** Carga el modelo (idempotente). */
  init(): Promise<void> {
    if (this.detector) return Promise.resolve();
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        this.detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });
      } catch {
        // Fallback a CPU si la GPU no está disponible.
        this.detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });
      }
    })();

    return this.loading;
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
