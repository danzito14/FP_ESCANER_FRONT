import { EstadoTrabajador } from './common';

export interface Trabajador {
  id_trabajador: number;
  nombre: string;
  apellido: string;
  id_area: number;
  foto_perfil?: string | null;
  estado: EstadoTrabajador;
  fecha_creacion: string;
  fecha_actualizacion: string;
  /** Indica si el trabajador ya tiene rostro/embedding registrado. */
  tiene_embedding: boolean;
}

export interface TrabajadorCreate {
  nombre: string;
  apellido: string;
  id_area: number;
}

export interface TrabajadorUpdate {
  nombre?: string;
  apellido?: string;
  id_area?: number;
  estado?: EstadoTrabajador;
}
