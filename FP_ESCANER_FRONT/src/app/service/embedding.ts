import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BaseCrud } from './base-crud';
import { API_URL } from '../core/constants/api';
import {
  Embedding,
  EmbeddingEliminado,
  EmbeddingRegistroResponse,
} from '../core/interfaces/embedding';

@Injectable({ providedIn: 'root' })
export class EmbeddingService extends BaseCrud<Embedding> {
  protected readonly resource = 'embeddings';

  /**
   * Registra el rostro de un trabajador con una sola foto.
   * POST /trabajadores/{id}/embedding/foto — multipart, campo `foto`.
   */
  registrarFoto(idTrabajador: number, foto: Blob): Observable<EmbeddingRegistroResponse> {
    const form = new FormData();
    form.append('foto', foto, 'rostro.jpg');
    return this.http.post<EmbeddingRegistroResponse>(
      `${API_URL}/trabajadores/${idTrabajador}/embedding/foto`,
      form,
    );
  }

  /**
   * Reemplaza (actualiza) el rostro existente de un trabajador.
   * PUT /embeddings/trabajador/{id}/foto — multipart, campo `foto`.
   */
  reemplazarFoto(idTrabajador: number, foto: Blob): Observable<Embedding> {
    const form = new FormData();
    form.append('foto', foto, 'rostro.jpg');
    return this.http.put<Embedding>(
      `${API_URL}/embeddings/trabajador/${idTrabajador}/foto`,
      form,
    );
  }

  /** Borra el embedding de un trabajador. DELETE /embeddings/trabajador/{id}. */
  eliminarDeTrabajador(idTrabajador: number): Observable<EmbeddingEliminado> {
    return this.http.delete<EmbeddingEliminado>(
      `${API_URL}/embeddings/trabajador/${idTrabajador}`,
    );
  }
}
