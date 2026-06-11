import { Estado, TipoAcceso } from './common';

export interface PuertaAcceso {
  id_puerta: number;
  nombre_puerta: string;
  /** Puede venir como WKT (POINT) y/o como latitud/longitud planas. */
  ubicacion?: string | null;
  latitud?: number | null;
  longitud?: number | null;
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
  id_area?: number;
  id_empresa?: number;
  id_dispositivo?: number;
  tipo_acceso: TipoAcceso;
  requiere_autorizacion: boolean;
  estado: Estado;
  latitud?: number;
  longitud?: number;
}

export interface PuertaAccesoUpdate {
  nombre_puerta?: string;
  id_area?: number;
  id_empresa?: number;
  id_dispositivo?: number;
  tipo_acceso?: TipoAcceso;
  requiere_autorizacion?: boolean;
  estado?: Estado;
  latitud?: number;
  longitud?: number;
}
