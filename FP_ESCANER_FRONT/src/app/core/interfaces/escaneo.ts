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

/** Respuesta de POST /scanner/acceso/liveness. */
export interface AccesoResponse {
  acceso: boolean;
  mensaje: string;
  trabajador: AccesoTrabajador | null;
  id_escaneo: number | null;
  estado_registro: string;
  /** Confianza/similitud del reconocimiento (0–1), si el backend la devuelve. */
  confianza?: number | null;
}
