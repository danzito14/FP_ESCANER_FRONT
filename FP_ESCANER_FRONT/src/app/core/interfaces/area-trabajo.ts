import { Estado } from './common';

export interface AreaTrabajo {
  id_area: number;
  nombre_area: string;
  descripcion?: string | null;
  /** Polígono PostGIS en formato WKT, ej: "POLYGON ((lng lat, ...))". */
  ubicacion?: string | null;
  id_empresa?: number | null;
  /** Hora de entrada, ej: "08:30:00". */
  hora_entrada?: string | null;
  estado: Estado;
  fecha_creacion: string;
}

export interface AreaTrabajoCreate {
  nombre_area: string;
  descripcion?: string;
  ubicacion?: string;
  id_empresa: number;
  hora_entrada?: string;
  estado: Estado;
}

export interface AreaTrabajoUpdate {
  nombre_area?: string;
  descripcion?: string;
  ubicacion?: string;
  id_empresa?: number;
  hora_entrada?: string;
  estado?: Estado;
}
