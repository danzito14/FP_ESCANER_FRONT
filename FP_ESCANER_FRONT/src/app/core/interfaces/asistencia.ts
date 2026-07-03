import { EstadoRegistro, TipoRegistro } from './common';

/**
 * Cuerpo de POST /asistencias (alta manual). `id_empresa` no se manda: el backend
 * la deriva del trabajador. `fecha_hora` opcional: null = ahora (UTC); en el flujo
 * de "rostro desconocido" se manda la fecha del intento.
 */
export interface AsistenciaManualCreate {
  id_trabajador: number;
  id_puerta: number;
  tipo_registro?: TipoRegistro;
  fecha_hora?: string | null;
  observaciones?: string | null;
  id_dispositivo?: number | null;
}

export interface Asistencia {
  /** UUID (string) — las tablas de eventos usan UUID. */
  id_asistencia: string;
  /** ID interno del trabajador (para operaciones/joins). */
  id_trabajador: number;
  /** Número de empleado de nómina; lo que se muestra en la tabla. null si no aplica. */
  id_emp?: string | null;
  id_puerta: number;
  tipo_registro: TipoRegistro;
  fecha_hora: string;
  confianza_biometrica?: number | null;
  estado_registro: EstadoRegistro;
  observaciones?: string | null;
  id_dispositivo?: number | null;
  /** Punto PostGIS en formato WKT, ej: "POINT (lng lat)". */
  ubicacion?: string | null;
  fecha_creacion: string;

  /** Nombres ya resueltos por el backend (para mostrar sin leer otras tablas). */
  trabajador_nombre?: string | null;
  puerta_nombre?: string | null;
  dispositivo_nombre?: string | null;
  area_nombre?: string | null;
  empresa_nombre?: string | null;
}
