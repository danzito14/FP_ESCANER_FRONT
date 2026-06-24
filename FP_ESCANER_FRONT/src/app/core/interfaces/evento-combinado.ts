import { EstadoIncidencia } from './common';

/** De qué tabla viene el evento en la lista combinada. */
export type OrigenEvento = 'incidencia' | 'intento';

/**
 * Fila normalizada de GET /incidencias/combinado (incidencias + intentos).
 * Campos null según el origen (estado/similitud/id_puerta/trabajador varían).
 */
export interface EventoCombinado {
  origen: OrigenEvento;
  /** UUID (string) del evento (incidencia o intento). */
  id: string;
  tipo: string;
  fecha: string;
  fecha_hora: string;
  descripcion: string;
  estado: EstadoIncidencia | null;
  id_trabajador: number | null;
  trabajador_nombre: string | null;
  id_puerta: number | null;
  similitud: number | null;
  /**
   * UUID del escaneo asociado. Las incidencias lo traen; los intentos (acceso
   * fallido sin escaneo) → null. Se usa para pedir `GET /escaneos/{id}` y dibujar
   * la ubicación registrada en el mapa del modal (eventos 'fuera_de_area').
   */
  id_escaneo_ref?: string | null;
  tiene_foto: boolean;
  /** Ruta ya resuelta al endpoint correcto de la foto, ej. "/incidencias/17/foto". */
  foto_url: string;
}
