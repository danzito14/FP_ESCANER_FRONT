import { EstadoIncidencia } from './common';

/**
 * Intento de acceso fallido (GET /intentos, PUT /intentos/{id_intento}).
 * El backend devuelve más campos; aquí solo tipamos lo que el front usa para
 * conocer y cambiar el `estado` (flujo de revisión añadido en v2). El display
 * de la tabla de Intentos sigue saliendo de GET /incidencias/combinado, que NO
 * trae el estado real de los intentos (siempre null) — por eso se enriquece con
 * el estado de este endpoint.
 */
export interface IntentoAcceso {
  /** UUID del intento. */
  id_intento: string;
  estado: EstadoIncidencia;
}

export interface IntentoUpdate {
  estado?: EstadoIncidencia;
}
