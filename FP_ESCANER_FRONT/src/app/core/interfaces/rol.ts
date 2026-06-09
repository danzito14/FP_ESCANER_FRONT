import { Estado } from './common';

export interface Rol {
  id_rol: number;
  nombre: string;
  descripcion?: string;
  permisos: { scopes: string[] };
  estado: Estado;
  fecha_creacion: string;
}
