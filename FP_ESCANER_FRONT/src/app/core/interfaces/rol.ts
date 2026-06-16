import { Estado } from './common';

export interface Permisos {
  scopes: string[];
}

export interface Rol {
  id_rol: number;
  nombre_rol: string;
  descripcion?: string | null;
  permisos: Permisos;
  estado: Estado;
  fecha_creacion: string;
}

export interface RolCreate {
  nombre_rol: string;
  descripcion?: string;
  permisos: Permisos;
}

export interface RolUpdate {
  nombre_rol?: string;
  descripcion?: string;
  permisos?: Permisos;
  estado?: Estado;
}
