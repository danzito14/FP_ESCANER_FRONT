import { TipoRegistro } from './common';

/** Parámetros (query string) de POST /scanner/acceso/liveness. */
export interface AccesoParams {
  id_puerta: number;
  tipo_registro: TipoRegistro;
  id_dispositivo?: number;
  latitud?: number;
  longitud?: number;
}

export interface AccesoTrabajador {
  id_trabajador: number;
  nombre: string;
  apellido: string;
  estado: string;
}

/**
 * Verdicto del reconocimiento facial con anti-spoof.
 * - no_rostro: no se detectó un rostro válido en las capturas.
 * - spoof: posible foto/pantalla (anti-suplantación).
 * - no_match: rostro válido pero no coincide con ningún trabajador.
 * - match: reconocido.
 */
export type ResultadoEscaneo = 'no_rostro' | 'spoof' | 'no_match' | 'match';

/** Respuesta de POST /scanner/acceso/liveness. */
export interface AccesoResponse {
  acceso: boolean;
  mensaje: string;
  trabajador: AccesoTrabajador | null;
  /** UUID (string) del escaneo generado. */
  id_escaneo: string | null;
  estado_registro: string;
  /** Verdicto del reconocimiento (si el backend lo devuelve). */
  resultado?: ResultadoEscaneo | null;
  /** Confianza/similitud del reconocimiento (0–1), si el backend la devuelve. */
  confianza?: number | null;
}
