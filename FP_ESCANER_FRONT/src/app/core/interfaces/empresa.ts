import { LngLat } from '../utils/geo';
import { Estado } from './common';

export interface Empresa {
  id_empresa: number;
  nombre_empresa: string;
  /** Puede venir como WKT (POLYGON) y/o como arreglo de pares [lng, lat]. */
  ubicacion?: string | null;
  coordenadas?: LngLat[] | null;
  zona_horaria: string;
  estado: Estado;
  fecha_creacion: string;
}

export interface EmpresaCreate {
  nombre_empresa: string;
  zona_horaria: string;
  estado: Estado;
  /** Vértices del polígono como pares [lng, lat]. */
  coordenadas?: LngLat[];
}

export interface EmpresaUpdate {
  nombre_empresa?: string;
  zona_horaria?: string;
  estado?: Estado;
  coordenadas?: LngLat[];
}
