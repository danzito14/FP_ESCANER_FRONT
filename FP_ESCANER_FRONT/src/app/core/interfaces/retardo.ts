/**
 * Fila de GET /incidencias/retardos (retardos calculados al vuelo comparando
 * hora esperada vs. hora real de entrada, con una tolerancia en minutos).
 * No es una incidencia almacenada: no tiene estado/foto; solo se pinta.
 */
export interface RetardoResponse {
  id_trabajador: number;
  id_emp: string | null;
  trabajador_nombre: string | null;
  id_area: number | null;
  area_nombre: string | null;
  id_empresa: number | null;
  /** Día del retardo (YYYY-MM-DD). */
  fecha: string;
  /** Hora esperada de entrada (HH:mm). */
  hora_esperada: string;
  /** Hora real de entrada (HH:mm). */
  hora_real: string;
  minutos_retardo: number;
}
