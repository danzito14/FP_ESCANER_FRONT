import { Estado, TipoAcceso } from './common';

export interface PuertaAcceso {
  id_puerta: number;
  nombre_puerta: string;
  /** Punto PostGIS en formato WKT, ej: "POINT (lng lat)". */
  ubicacion?: string | null;
  id_area?: number | null;
  id_empresa?: number | null;
  id_dispositivo?: number | null;
  tipo_acceso: TipoAcceso;
  requiere_autorizacion: boolean;
  estado: Estado;
  fecha_creacion: string;
}

export interface PuertaAccesoCreate {
  nombre_puerta: string;
  ubicacion?: string;
  id_area?: number;
  id_empresa?: number;
  id_dispositivo?: number;
  tipo_acceso: TipoAcceso;
  requiere_autorizacion: boolean;
  estado: Estado;
}

export interface PuertaAccesoUpdate {
  nombre_puerta?: string;
  ubicacion?: string;
  id_area?: number;
  id_empresa?: number;
  id_dispositivo?: number;
  tipo_acceso?: TipoAcceso;
  requiere_autorizacion?: boolean;
  estado?: Estado;
}
