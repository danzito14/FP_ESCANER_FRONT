/** Estado estándar (usuarios, empresas, áreas, embeddings). */
export type Estado = 'activo' | 'inactivo';

/** Estado de trabajadores (incluye 'suspendido'). */
export type EstadoTrabajador = 'activo' | 'inactivo' | 'suspendido';

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
  | 'fuera_de_area';

/** Estado de una incidencia (flujo de revisión). */
export type EstadoIncidencia = 'pendiente' | 'revisada' | 'justificada';

/** Tipo de acceso de una puerta. */
export type TipoAcceso = 'entrada' | 'salida' | 'bidireccional';
