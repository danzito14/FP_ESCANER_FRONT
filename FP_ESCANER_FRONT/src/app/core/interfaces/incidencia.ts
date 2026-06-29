import { EstadoIncidencia, TipoIncidencia } from './common';

export interface Incidencia {
  /** UUID (string) — las tablas de eventos usan UUID. */
  id_incidencia: string;
  id_trabajador: number;
  tipo_incidencia: TipoIncidencia;
  /** Fecha de la incidencia (YYYY-MM-DD). */
  fecha: string;
  descripcion?: string | null;
  ruta_foto?: string | null;
  /** UUID del escaneo relacionado. */
  id_escaneo_ref?: string | null;
  estado: EstadoIncidencia;
  fecha_creacion: string;
  /** Nombre ya resuelto por el backend (para mostrar sin leer trabajadores). */
  trabajador_nombre?: string | null;
}

export interface IncidenciaUpdate {
  estado?: EstadoIncidencia;
  descripcion?: string;
}
