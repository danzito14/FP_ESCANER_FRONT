import { Estado } from './common';
import { Rol } from './rol';

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

/** Respuesta de GET /usuarios/me: el usuario con su rol y permisos. */
export interface UsuarioMe extends Usuario {
  rol?: Rol;
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
