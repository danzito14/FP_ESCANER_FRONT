import { EstadoDispositivo, TipoDispositivo } from './common';

export interface Dispositivo {
  id_dispositivo: number;
  nombre_dispositivo: string;
  tipo_dispositivo: TipoDispositivo;
  ip_dispositivo?: string | null;
  puerto?: number | null;
  /** Puede venir como WKT (POINT) y/o como latitud/longitud planas. */
  ubicacion?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  id_area?: number | null;
  estado: EstadoDispositivo;
  ultima_conexion?: string | null;
  /** Fecha de instalación (YYYY-MM-DD). */
  fecha_instalacion?: string | null;
  fecha_creacion: string;
}

export interface DispositivoCreate {
  nombre_dispositivo: string;
  tipo_dispositivo: TipoDispositivo;
  ip_dispositivo?: string;
  puerto?: number;
  id_area?: number;
  estado: EstadoDispositivo;
  fecha_instalacion?: string;
  latitud?: number;
  longitud?: number;
}

export interface DispositivoUpdate {
  nombre_dispositivo?: string;
  tipo_dispositivo?: TipoDispositivo;
  ip_dispositivo?: string;
  puerto?: number;
  id_area?: number;
  estado?: EstadoDispositivo;
  fecha_instalacion?: string;
  latitud?: number;
  longitud?: number;
}
