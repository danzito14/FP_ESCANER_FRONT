import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../core/constants/api';
import { AccesoParams, AccesoResponse } from '../core/interfaces/escaneo';

@Injectable({ providedIn: 'root' })
export class ScannerService {
  private readonly http = inject(HttpClient);

  /**
   * Envía las 3–5 capturas del rostro en UNA petición multipart.
   * Datos como query params; imágenes en el campo `fotos` (array de archivos).
   */
  acceso(params: AccesoParams, imagenes: Blob[]): Observable<AccesoResponse> {
    let p = new HttpParams()
      .set('id_puerta', params.id_puerta)
      .set('tipo_registro', params.tipo_registro);
    if (params.id_dispositivo) p = p.set('id_dispositivo', params.id_dispositivo);
    if (params.latitud != null) p = p.set('latitud', params.latitud);
    if (params.longitud != null) p = p.set('longitud', params.longitud);

    const form = new FormData();
    imagenes.forEach((img, i) => form.append('fotos', img, `captura_${i + 1}.jpg`));

    return this.http.post<AccesoResponse>(`${API_URL}/scanner/acceso/liveness`, form, {
      params: p,
    });
  }
}
