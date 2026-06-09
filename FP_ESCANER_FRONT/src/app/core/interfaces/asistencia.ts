import { EstadoRegistro, TipoRegistro } from './common';

export interface Asistencia {
  id_asistencia: number;
  id_trabajador: number;
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
}
