import { EstadoTrabajador, NivelAccesoInterno, PermisoEscaneo } from './common';

export interface Trabajador {
  /** ID interno (PK) — se sigue usando para TODAS las operaciones (editar, borrar, rostro). */
  id_trabajador: number;
  /**
   * Número de empleado de la nómina (SYS21). Es el identificador "humano" que se
   * muestra en las tablas. null en trabajadores creados manualmente.
   */
  id_emp?: string | null;
  /** Origen de nómina (ej. 'agricola_com'); acompaña a id_emp. */
  origen_nomina?: string | null;
  /** Empresa (tenant) del trabajador; el backend la deriva del área. */
  id_empresa?: number | null;
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
  /** Nº de empleado (nómina). Opcional; null/omitido para altas manuales. */
  id_emp?: string | null;
  /** El backend deriva la empresa del área; no se envía id_empresa. */
  id_area: number;
  permiso_escaneo: PermisoEscaneo;
  /** null = sin permisos de acceso interno. */
  nivel_acceso_interno: NivelAccesoInterno | null;
}

export interface TrabajadorUpdate {
  nombre?: string;
  apellido?: string;
  id_emp?: string | null;
  id_area?: number;
  estado?: EstadoTrabajador;
  permiso_escaneo?: PermisoEscaneo;
  nivel_acceso_interno?: NivelAccesoInterno | null;
}

/** Trabajador dentro de un grupo de duplicados (subconjunto de campos). */
export interface TrabajadorDuplicado {
  id_trabajador: number;
  id_emp: string | null;
  origen_nomina: string | null;
  nombre: string;
  apellido: string;
  id_empresa: number | null;
  /** true = tiene rostro registrado; si se borra, ese embedding se pierde. */
  tiene_embedding: boolean;
}

/** Un grupo de duplicados: se conserva uno y se borran el resto. */
export interface GrupoDuplicados {
  /** Clave por la que se agruparon (ej. nombre normalizado). */
  nombre_clave: string;
  conservado: TrabajadorDuplicado;
  eliminados: TrabajadorDuplicado[];
}

/** Duplicado que NO se pudo borrar (FK RESTRICT: tiene dependencias). */
export interface DuplicadoNoEliminado {
  id_trabajador: number;
  nombre: string;
  apellido: string;
  motivo: string;
}

/** Respuesta de POST /trabajadores/limpiar-duplicados (super-admin). */
export interface LimpiarDuplicadosResponse {
  /** true = dry-run (simular=true): no borró nada, solo el plan. */
  simulado: boolean;
  grupos_con_duplicados: number;
  /** Total de duplicados detectados (los que se borrarían al aplicar). */
  duplicados_detectados: number;
  /** Nº realmente borrado (0 en simulación). */
  eliminados: number;
  /** Los que se saltaron al aplicar por tener dependencias. */
  no_eliminados: DuplicadoNoEliminado[];
  detalle: GrupoDuplicados[];
}
