/** Estado estándar (usuarios, empresas, áreas, embeddings). */
export type Estado = 'activo' | 'inactivo';

/** Estado de trabajadores (incluye 'suspendido'). */
export type EstadoTrabajador = 'activo' | 'inactivo' | 'suspendido';

/** Permiso de escaneo del trabajador (qué tipo de puertas puede usar). */
export type PermisoEscaneo = 'campo' | 'administrativo' | 'general' | 'super';

/** Nivel de acceso interno (zona destino permitida en control de acceso). */
export type NivelAccesoInterno = 'oficina' | 'empaque' | 'mixto';

/** Estado de dispositivos (incluye 'mantenimiento'). */
export type EstadoDispositivo = 'activo' | 'inactivo' | 'mantenimiento';

/** Tipo de dispositivo biométrico. */
export type TipoDispositivo = 'escaner_facial' | 'huella' | 'escaner_qr';

/** Tipo de embedding biométrico. */
export type TipoEmbedding = 'facial' | 'huella' | 'iris';

/** Tipo de registro de asistencia. */
export type TipoRegistro = 'entrada' | 'salida';

/** Estado del registro de asistencia. */
export type EstadoRegistro =
  | 'exitoso'
  | 'rechazado'
  | 'manual'
  | 'fuera_de_area'
  | 'cancelado';

/** Tipo de incidencia. */
export type TipoIncidencia =
  | 'salida_sin_registro'
  | 'entrada_sin_registro'
  | 'falta'
  | 'retardo'
  | 'fuera_de_area'
  | 'acceso_otra_empresa'
  | 'area_incorrecta';

/** Estado de una incidencia (flujo de revisión). */
export type EstadoIncidencia = 'pendiente' | 'revisada' | 'justificada';

/** Tipo de acceso de una puerta. */
export type TipoAcceso = 'entrada' | 'salida' | 'bidireccional';

/** Tipo de puerta (qué trabajadores la pueden usar). */
export type TipoPuerta = 'campo' | 'administrativa' | 'mixta';

/** Función de la puerta (registra asistencia o controla acceso a zona). */
export type FuncionPuerta = 'asistencia' | 'control_acceso';
