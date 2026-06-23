import { EstadoTrabajador, NivelAccesoInterno, PermisoEscaneo } from './common';

export interface Trabajador {
  id_trabajador: number;
  nombre: string;
  apellido: string;
  id_area: number;
  foto_perfil?: string | null;
  estado: EstadoTrabajador;
  /** Qué tipo de puertas puede usar (default 'campo'). */
  permiso_escaneo: PermisoEscaneo;
  /** Zona interna permitida; null = sin permisos (default null para 'campo'). */
  nivel_acceso_interno: NivelAccesoInterno | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
  /** Indica si el trabajador ya tiene rostro/embedding registrado. */
  tiene_embedding: boolean;
}

export interface TrabajadorCreate {
  nombre: string;
  apellido: string;
  /** El backend deriva la empresa del área; no se envía id_empresa. */
  id_area: number;
  permiso_escaneo: PermisoEscaneo;
  /** null = sin permisos de acceso interno. */
  nivel_acceso_interno: NivelAccesoInterno | null;
}

export interface TrabajadorUpdate {
  nombre?: string;
  apellido?: string;
  id_area?: number;
  estado?: EstadoTrabajador;
  permiso_escaneo?: PermisoEscaneo;
  nivel_acceso_interno?: NivelAccesoInterno | null;
}
