import { Estado, TipoEmbedding } from './common';
import { Trabajador } from './trabajador';

/**
 * Embedding biométrico. Hay como máximo uno por trabajador (UNIQUE id_trabajador).
 * El vector (vector(512)) se omite a propósito: no se administra desde el front.
 */
export interface Embedding {
  id_embedding: number;
  id_trabajador: number;
  tipo_embedding: TipoEmbedding;
  fecha_captura: string;
  calidad_embedding?: number | null;
  modelo_ia?: string | null;
  estado: Estado;
}

/** Respuesta de POST /trabajadores/{id}/embedding/foto. */
export interface EmbeddingRegistroResponse {
  trabajador: Trabajador;
  embedding_id: number;
  modelo_ia: string;
  dimensiones: number;
  /** Calidad del embedding (0–1). */
  calidad: number;
  mensaje: string;
}

/** Respuesta de DELETE /embeddings/trabajador/{id}. */
export interface EmbeddingEliminado {
  eliminado: boolean;
  id_embedding: number;
  id_trabajador: number;
  mensaje: string;
}
