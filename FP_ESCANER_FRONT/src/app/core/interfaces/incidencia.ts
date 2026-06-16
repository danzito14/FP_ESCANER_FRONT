import { EstadoIncidencia, TipoIncidencia } from './common';

export interface Incidencia {
  id_incidencia: number;
  id_trabajador: number;
  tipo_incidencia: TipoIncidencia;
  /** Fecha de la incidencia (YYYY-MM-DD). */
  fecha: string;
  descripcion?: string | null;
  ruta_foto?: string | null;
  id_escaneo_ref?: number | null;
  estado: EstadoIncidencia;
  fecha_creacion: string;
  /** Nombre ya resuelto por el backend (para mostrar sin leer trabajadores). */
  trabajador_nombre?: string | null;
}

export interface IncidenciaUpdate {
  estado?: EstadoIncidencia;
  descripcion?: string;
}
