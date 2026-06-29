import { EstadoRegistro, TipoRegistro } from './common';

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
