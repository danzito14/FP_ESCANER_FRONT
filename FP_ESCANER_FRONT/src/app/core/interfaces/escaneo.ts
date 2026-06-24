import { EstadoRegistro, TipoRegistro } from './common';

/**
 * Lectura de GET /escaneos/{id_escaneo} — registro completo de un escaneo facial.
 * Refleja la tabla `escaneos` (la API serializa `geography(Point)` como WKT).
 */
export interface EscaneoResponse {
  /** UUID del escaneo. */
  id_escaneo: string;
  id_trabajador: number;
  id_puerta: number;
  id_empresa?: number | null;
  tipo_registro: TipoRegistro;
  fecha_hora: string;
  confianza_biometrica?: number | null;
  estado_registro: EstadoRegistro;
  /** El backend ya calculó si el escaneo cayó dentro del área asignada. */
  dentro_de_area?: boolean | null;
  observaciones?: string | null;
  id_dispositivo?: number | null;
  /** Punto PostGIS en WKT, ej. "POINT (lng lat)"; null si no se capturó coordenada. */
  ubicacion?: string | null;
  fecha_creacion: string;
}

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
