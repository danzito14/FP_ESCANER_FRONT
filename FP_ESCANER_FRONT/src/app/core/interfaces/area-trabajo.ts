import { LngLat } from '../utils/geo';
import { Estado } from './common';

export interface AreaTrabajo {
  id_area: number;
  nombre_area: string;
  descripcion?: string | null;
  /** Puede venir como WKT (POLYGON) y/o como arreglo de pares [lng, lat]. */
  ubicacion?: string | null;
  coordenadas?: LngLat[] | null;
  id_empresa?: number | null;
  /** Hora de entrada, ej: "08:30:00". */
  hora_entrada?: string | null;
  estado: Estado;
  fecha_creacion: string;
}

export interface AreaTrabajoCreate {
  nombre_area: string;
  descripcion?: string;
  id_empresa: number;
  hora_entrada?: string;
  estado: Estado;
  /** Vértices del polígono como pares [lng, lat]. */
  coordenadas?: LngLat[];
}

export interface AreaTrabajoUpdate {
  nombre_area?: string;
  descripcion?: string;
  id_empresa?: number;
  hora_entrada?: string;
  estado?: Estado;
  coordenadas?: LngLat[];
}
