import { Estado } from './common';

export interface Usuario {
  id_usuario: number;
  nombre_usuario: string;
  id_rol: number;
  /** Empresa a la que pertenece el usuario. */
  empresa: number;
  estado: Estado;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface UsuarioCreate {
  nombre_usuario: string;
  contrasena: string;
  id_rol: number;
  empresa: number;
}

export interface UsuarioUpdate {
  nombre_usuario?: string;
  contrasena?: string;
  id_rol?: number;
  empresa?: number;
  estado?: Estado;
}
