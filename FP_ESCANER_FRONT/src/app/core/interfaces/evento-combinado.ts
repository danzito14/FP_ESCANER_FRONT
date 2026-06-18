import { EstadoIncidencia } from './common';

/** De qué tabla viene el evento en la lista combinada. */
export type OrigenEvento = 'incidencia' | 'intento';

/**
 * Fila normalizada de GET /incidencias/combinado (incidencias + intentos).
 * Campos null según el origen (estado/similitud/id_puerta/trabajador varían).
 */
export interface EventoCombinado {
  origen: OrigenEvento;
  id: number;
  tipo: string;
  fecha: string;
  fecha_hora: string;
  descripcion: string;
  estado: EstadoIncidencia | null;
  id_trabajador: number | null;
  trabajador_nombre: string | null;
  id_puerta: number | null;
  similitud: number | null;
  tiene_foto: boolean;
  /** Ruta ya resuelta al endpoint correcto de la foto, ej. "/incidencias/17/foto". */
  foto_url: string;
}
