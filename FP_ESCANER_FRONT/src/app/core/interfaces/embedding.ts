import { Estado, TipoEmbedding } from './common';

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
