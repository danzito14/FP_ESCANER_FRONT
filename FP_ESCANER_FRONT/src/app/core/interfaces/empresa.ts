import { Estado } from './common';

export interface Empresa {
  id_empresa: number;
  nombre_empresa: string;
  /** Polígono PostGIS en formato WKT, ej: "POLYGON ((lng lat, ...))". */
  ubicacion?: string | null;
  zona_horaria: string;
  estado: Estado;
  fecha_creacion: string;
}

export interface EmpresaCreate {
  nombre_empresa: string;
  ubicacion?: string;
  zona_horaria: string;
  estado: Estado;
}

export interface EmpresaUpdate {
  nombre_empresa?: string;
  ubicacion?: string;
  zona_horaria?: string;
  estado?: Estado;
}
