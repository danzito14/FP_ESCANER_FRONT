import { registerPlugin } from '@capacitor/core';

export interface FaceEnginePlugin {
  /** Crea la sesión de reconocimiento desde la ruta del modelo bajado (verifica sha256 si viene). */
  init(o: { recognitionPath: string; sha256?: string }): Promise<{ ok: boolean }>;
  /** path = uri del frame; kps = 10 números (5 puntos x,y) ordenados img-izq→der. */
  extractEmbedding(o: { path: string; kps: number[] }): Promise<{ embedding: number[] }>;
  /** Anti-spoof MiniFASNet on-device. bbox = [x1,y1,x2,y2] px. */
  checkLiveness(o: { path: string; bbox: number[] }):
    Promise<{ esReal: boolean; scoreReal: number; label: number }>;
  /** Fuerza el recolector de basura para soltar los bitmaps nativos acumulados por frame. */
  liberarMemoria(): Promise<void>;
  /** DIAGNÓSTICO: bytes asignados en el heap nativo del proceso (para localizar fugas). */
  memoriaNativa(): Promise<{ asignada: number; total: number }>;
}
export const FaceEngine = registerPlugin<FaceEnginePlugin>('FaceEngine');
