import { Injectable, inject } from '@angular/core';
import {
  FaceDetection, LandmarkMode, PerformanceMode, ContourMode,
} from '@capacitor-mlkit/face-detection';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FaceEngine } from './face-engine';
import { ordenarKps } from './face-kps.util';
import { CameraService, stripDataUrl } from '../service/camera';
import { ScannerConfigService } from '../service/scanner-config';

const MAX_POSE = 25, MIN_FACE = 0.15, UMBRAL_LIVENESS = 0.5;

@Injectable({ providedIn: 'root' })
export class FacialService {
  private readonly camera = inject(CameraService);
  private readonly cfg = inject(ScannerConfigService);

  /**
   * Embedding de un archivo (uri). `conLiveness` aplica el anti-spoof, pero SOLO si está
   * activado en Configuración (el modelo aún no está calibrado → default OFF).
   */
  private async embeddingDeArchivo(uri: string, conLiveness: boolean): Promise<Float32Array | null> {
    const { faces } = await FaceDetection.processImage({
      path: uri, performanceMode: PerformanceMode.Accurate,
      landmarkMode: LandmarkMode.All, contourMode: ContourMode.None, minFaceSize: MIN_FACE });
    if (faces.length !== 1) return null;
    const f = faces[0];
    if (Math.abs(f.headEulerAngleY ?? 0) > MAX_POSE ||
        Math.abs(f.headEulerAngleX ?? 0) > MAX_POSE) return null;

    if (conLiveness && this.cfg.livenessOffline()) {
      try {
        const bbox = [f.bounds.left, f.bounds.top, f.bounds.right, f.bounds.bottom];
        const live = await FaceEngine.checkLiveness({ path: uri, bbox });
        if (!live.esReal || live.scoreReal < UMBRAL_LIVENESS) return null;
      } catch { /* si liveness falla, no bloquea el enrolamiento */ }
    }

    const kps = ordenarKps(f.landmarks);
    if (!kps) return null;
    const { embedding } = await FaceEngine.extractEmbedding({ path: uri, kps });
    return Float32Array.from(embedding);
  }

  /** Captura UN frame del <video> → embedding. */
  private async capturarUno(video: HTMLVideoElement): Promise<Float32Array | null> {
    let uri: string | undefined;
    try {
      const dataUrl = this.camera.capture(video, 0.9);
      const w = await Filesystem.writeFile({
        path: `cap_${Date.now()}.jpg`, data: stripDataUrl(dataUrl), directory: Directory.Cache });
      uri = w.uri;
      return await this.embeddingDeArchivo(uri, true);
    } catch { return null; }
    finally { if (uri) Filesystem.deleteFile(
        { path: uri.split('/').pop()!, directory: Directory.Cache }).catch(() => {}); }
  }

  /** Enrolamiento por CÁMARA: junta N frames del <video> y los promedia (referencia estable). */
  async capturarDeVideo(
    video: HTMLVideoElement, n = 4, maxIntentos = 30,
  ): Promise<{ embedding: number[]; calidad: number } | null> {
    const buenos: Float32Array[] = [];
    for (let i = 0; i < maxIntentos && buenos.length < n; i++) {
      const e = await this.capturarUno(video);
      if (e) buenos.push(e);
      await new Promise((r) => setTimeout(r, 220));
    }
    return buenos.length >= n ? this.promediar(buenos) : null;
  }

  /** Enrolamiento por ARCHIVO subido: un solo embedding (sin liveness — es una imagen). */
  async embeddingDeArchivoSubido(
    file: File,
  ): Promise<{ embedding: number[]; calidad: number } | null> {
    let uri: string | undefined;
    try {
      const base64 = await this.fileABase64(file);
      const w = await Filesystem.writeFile({
        path: `up_${Date.now()}.jpg`, data: base64, directory: Directory.Cache });
      uri = w.uri;
      const e = await this.embeddingDeArchivo(uri, false);
      return e ? { embedding: Array.from(e), calidad: 1 } : null;
    } catch { return null; }
    finally { if (uri) Filesystem.deleteFile(
        { path: uri.split('/').pop()!, directory: Directory.Cache }).catch(() => {}); }
  }

  /** Promedia embeddings + L2-norm; calidad = auto-consistencia (coseno medio vs la media). */
  private promediar(buenos: Float32Array[]): { embedding: number[]; calidad: number } {
    const media = new Float32Array(512);
    for (const e of buenos) for (let k = 0; k < 512; k++) media[k] += e[k];
    let norm = 0;
    for (let k = 0; k < 512; k++) { media[k] /= buenos.length; norm += media[k] * media[k]; }
    norm = Math.sqrt(norm);
    for (let k = 0; k < 512; k++) media[k] /= norm;
    let suma = 0;
    for (const e of buenos) { let d = 0; for (let k = 0; k < 512; k++) d += e[k] * media[k]; suma += d; }
    return { embedding: Array.from(media), calidad: suma / buenos.length };
  }

  private fileABase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(stripDataUrl(r.result as string));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
}
