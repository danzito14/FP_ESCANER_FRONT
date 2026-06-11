import { Injectable, inject } from '@angular/core';

import { PlatformService } from './platform';

/**
 * Acceso a la cámara para el scanner: abrir stream y capturar un frame.
 * - Web: `navigator.mediaDevices.getUserMedia`.
 * - Native (APK): el webview soporta getUserMedia; si se quiere la cámara nativa,
 *   migrar a `@capacitor/camera` al empaquetar.
 */
@Injectable({ providedIn: 'root' })
export class CameraService {
  private readonly platform = inject(PlatformService);
  private stream: MediaStream | null = null;

  get isSupported(): boolean {
    return this.platform.isBrowser && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (!this.isSupported) {
      throw new Error('La cámara no está disponible en este dispositivo/navegador.');
    }
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = this.stream;
    await video.play();
  }

  /** Captura el frame actual como data URL JPEG (con prefijo data:image/jpeg;base64,). */
  capture(video: HTMLVideoElement, quality = 0.9): string {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo capturar la imagen.');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  /** Captura solo una región (recorte de un rostro) del frame actual como data URL JPEG. */
  captureRegion(
    video: HTMLVideoElement,
    x: number,
    y: number,
    w: number,
    h: number,
    quality = 0.9,
  ): string {
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const sw = Math.max(1, Math.min(vw - sx, Math.floor(w)));
    const sh = Math.max(1, Math.min(vh - sy, Math.floor(h)));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo recortar la imagen.');
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/jpeg', quality);
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

/** Quita el prefijo "data:image/...;base64," y deja solo el base64. */
export function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/** Convierte un data URL a Blob (para enviar como archivo multipart). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
