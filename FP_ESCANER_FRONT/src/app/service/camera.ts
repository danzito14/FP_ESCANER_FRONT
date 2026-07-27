import { Injectable, inject } from '@angular/core';

import { PlatformService } from './platform';
import { ScannerConfigService } from './scanner-config';

/**
 * Acceso a la cámara para el scanner: abrir stream y capturar un frame.
 * - Web: `navigator.mediaDevices.getUserMedia`.
 * - Native (APK): el webview soporta getUserMedia; si se quiere la cámara nativa,
 *   migrar a `@capacitor/camera` al empaquetar.
 */
@Injectable({ providedIn: 'root' })
export class CameraService {
  private readonly platform = inject(PlatformService);
  private readonly cfg = inject(ScannerConfigService);
  private stream: MediaStream | null = null;

  /**
   * Lienzo reutilizable para las capturas. Crear un canvas nuevo en cada frame
   * (varias veces por segundo con la cámara abierta) rota memoria en el WebView y
   * contribuye a que Android mate el proceso renderer. Reusar uno solo lo evita.
   */
  private lienzo: HTMLCanvasElement | null = null;
  private get canvas(): HTMLCanvasElement {
    if (!this.lienzo) this.lienzo = document.createElement('canvas');
    return this.lienzo;
  }

  get isSupported(): boolean {
    return this.platform.isBrowser && !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * Abre la cámara. Usa el `deviceId` indicado o, si no, el elegido en
   * Configuración; si no hay, la frontal. Si el id guardado ya no existe,
   * reintenta con la cámara por defecto.
   */
  async start(video: HTMLVideoElement, deviceId?: string): Promise<void> {
    if (!this.isSupported) {
      throw new Error('La cámara no está disponible en este dispositivo/navegador.');
    }
    this.stop();
    const id = deviceId || this.cfg.camaraId();
    const { width, height } = this.resolucionIdeal();
    const tamano = { width: { ideal: width }, height: { ideal: height } };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, ...tamano } : { facingMode: 'user', ...tamano },
        audio: false,
      });
    } catch (e) {
      // La cámara elegida ya no está disponible: reintenta con la por defecto.
      if (!id) throw e;
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', ...tamano },
        audio: false,
      });
    }
    video.srcObject = this.stream;
    await video.play();
  }

  /** Lista las cámaras (videoinput). Las etiquetas solo aparecen con permiso. */
  async listarCamaras(): Promise<MediaDeviceInfo[]> {
    if (!this.isSupported || !navigator.mediaDevices.enumerateDevices) return [];
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    return dispositivos.filter((d) => d.kind === 'videoinput');
  }

  /**
   * Pide permiso (para poder leer las etiquetas) y devuelve las cámaras.
   * Abre y cierra un stream temporal solo para obtener el permiso.
   */
  async pedirPermisoYListar(): Promise<MediaDeviceInfo[]> {
    if (!this.isSupported) return [];
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach((t) => t.stop());
    } catch {
      // Sin permiso: se enumeran igual (probablemente sin etiquetas).
    }
    return this.listarCamaras();
  }

  /** Captura el frame actual como data URL JPEG (con prefijo data:image/jpeg;base64,). */
  capture(video: HTMLVideoElement, quality = 0.9): string {
    const canvas = this.canvas;
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

    const canvas = this.canvas;
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

  /** Resolución (ideal) según la calidad elegida en Configuración. */
  private resolucionIdeal(): { width: number; height: number } {
    const r = this.porCalidad();
    // En la APK (tablets de gama baja tipo Galaxy Tab A8, 2.4 GB y marcadas como
    // "low memory device") abrir la cámara alto revienta la memoria y el Low Memory
    // Killer mata el proceso. Topamos a 480p en nativo: el reconocimiento va bien
    // (el rostro se alinea a 112×112) y la huella baja ~3× respecto a 720p.
    if (this.platform.isNative && r.width > 640) {
      return { width: 640, height: 480 };
    }
    return r;
  }

  private porCalidad(): { width: number; height: number } {
    switch (this.cfg.calidad()) {
      case 'sd':
        return { width: 640, height: 480 };
      case 'fhd':
        return { width: 1920, height: 1080 };
      case 'max':
        return { width: 3840, height: 2160 }; // pide lo más alto; el navegador da el máx soportado
      case 'hd':
      default:
        return { width: 1280, height: 720 };
    }
  }
}

/**
 * Convierte la etiqueta cruda de una cámara (la da el navegador/SO, ej.
 * "camera 0, facing back", "USB2.0 HD UVC WebCam (1234:5678)") en un nombre
 * legible en español. No hay estándar: se normaliza por palabras clave.
 */
export function etiquetaCamara(label: string | undefined, index: number): string {
  const raw = (label ?? '').trim();
  if (!raw) return `Cámara ${index + 1}`;
  const l = raw.toLowerCase();
  // Limpia identificadores de hardware tipo (1234:5678).
  const limpio = raw.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/i, '').trim();

  if (/\busb\b/.test(l)) return limpio || `Cámara USB ${index + 1}`;
  if (/back|rear|trasera|environment/.test(l)) return 'Cámara trasera';
  if (/front|user|frontal|selfie/.test(l)) return 'Cámara frontal';
  // Webcam con nombre real (integrada/externa): usa su nombre ya limpio.
  return limpio;
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
