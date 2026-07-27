/**
 * Contratos del backend LOCAL del kiosko de escritorio (`kiosk_local`, :8100).
 * Es un servicio aparte del backend en la nube: reconoce local-first y cae a la
 * nube solo. Sin auth (escucha solo en localhost). Ver
 * docs/PLAN_KIOSKO_ESCRITORIO_BACKEND.md.
 */

/** De dónde salió la respuesta: reconocido en la BD local o por fallback a la nube. */
export type KioskOrigen = 'local' | 'nube';

/** Verdicto del reconocimiento local (mismo espíritu que ResultadoEscaneo de la nube). */
export type KioskEstadoAcceso = 'match' | 'no_match' | 'no_rostro' | 'spoof' | string;

export interface KioskTrabajador {
  id_trabajador: number;
  nombre: string;
  apellido: string;
  id_empresa?: number | null;
  /** Similitud coseno del match local (0–1). */
  similitud?: number | null;
}

/** Respuesta de POST /kiosk/acceso (reconoce + registra en la cola local). */
export interface KioskAccesoResponse {
  acceso: boolean;
  origen: KioskOrigen;
  mensaje: string;
  trabajador?: KioskTrabajador | null;
  /** UUID del escaneo local encolado (null si no se registró). */
  id_escaneo?: string | null;
  /** Verdicto cuando no hay acceso (no_match | no_rostro | spoof). */
  estado?: KioskEstadoAcceso | null;
  /** Cuando origen='nube' puede venir la confianza del ScanResponse de la nube. */
  confianza?: number | null;
}

/** Respuesta de POST /kiosk/identificar (dice quién es, sin registrar). */
export interface KioskIdentificarResponse {
  estado: KioskEstadoAcceso;
  trabajador?: KioskTrabajador | null;
  /** Score del detector (0–1). */
  det_score?: number | null;
}

/** Respuesta de POST /kiosk/roster/sync (baja el roster de la nube a la BD local). */
export interface KioskRosterSyncResponse {
  empresa: number;
  tipo: string;
  roster_version: string;
  trabajadores: number;
  embeddings: number;
  areas: number;
  puertas: number;
}

/** Respuesta de POST /kiosk/sync/eventos (sube la cola local a la nube). */
export interface KioskSyncEventosResponse {
  subidos?: number;
  insertados?: number;
  duplicados?: number;
  rechazados?: number;
  /** Si no había nada que subir. */
  pendientes?: number;
}

/**
 * Umbrales EFECTIVOS del reconocimiento de esta estación (GET/POST /kiosk/config).
 * Los sirve el propio kiosk_local leyendo lo que usa `recognition` ahora mismo
 * (override guardado o default del compose), así que el front nunca inventa defaults:
 * muestra lo que venga y manda solo lo que el usuario cambie.
 */
export interface KioskConfig {
  /** Si es false, los cambios en caliente no se aplican (solo lectura). */
  CONFIG_RUNTIME_ACTIVO: boolean;

  // Calidad de la imagen
  CALIDAD_GATE_ACTIVO: boolean;
  CALIDAD_DET_SCORE_MIN: number;
  CALIDAD_FACE_RATIO_MIN: number;
  CALIDAD_BLUR_MIN: number;
  CALIDAD_BORDE_MARGEN: number;

  // Anti-spoof (foto impresa / pantalla)
  ANTISPOOFING_ACTIVO: boolean;
  ANTISPOOF_UMBRAL: number;
  SPOOFING_UMBRAL: number;

  // Reconocimiento (match contra el padrón)
  SIMILITUD_UMBRAL: number;
  SIMILITUD_UMBRAL_ACOTADO: number;

  // Prueba de vida (movimiento entre frames de la ráfaga)
  LIVENESS_MIN_FRAMES_CON_ROSTRO: number;
  LIVENESS_MISMA_PERSONA_UMBRAL: number;
  LIVENESS_MOVIMIENTO_MIN: number;
}

/** Cuerpo del POST /kiosk/config: solo las claves que se tocan. */
export type KioskConfigParcial = Partial<Omit<KioskConfig, 'CONFIG_RUNTIME_ACTIVO'>>;

/** Respuesta de GET /kiosk/estado. */
export interface KioskEstado {
  trabajadores: number;
  embeddings_activos: number;
  /** Fichajes exitosos aún no subidos a la nube (opcional: backends viejos no lo mandan). */
  pendientes_asistencias?: number;
  /** Rechazos/intentos fallidos aún no subidos. */
  pendientes_intentos?: number;
  /**
   * Metadatos del padrón (empresa, roster_version, tipo…). OJO: hoy incluye también
   * `cloud_token`, un JWT de la nube — no mostrarlo ni registrarlo en ningún lado.
   */
  meta: Record<string, string>;
  hay_conexion: boolean;
}
