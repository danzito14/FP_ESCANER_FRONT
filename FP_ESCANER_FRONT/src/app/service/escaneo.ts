import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { SCANNER_URL } from '../core/constants/api';
import { AccesoParams, AccesoResponse, EscaneoResponse } from '../core/interfaces/escaneo';
import { BaseCrud } from './base-crud';

@Injectable({ providedIn: 'root' })
export class ScannerService {
  private readonly http = inject(HttpClient);

  /**
   * Envía las 3–5 capturas del rostro en UNA petición multipart.
   * Datos como query params; imágenes en el campo `fotos` (array de archivos).
   *
   * Va contra SCANNER_URL, no contra API_URL: en web/APK es la nube y en la estación de
   * escritorio es el back LOCAL, que sirve estas MISMAS rutas con la misma respuesta.
   * Por eso esta pantalla ficha con y sin internet sin un solo `if` de por medio.
   */
  acceso(params: AccesoParams, imagenes: Blob[]): Observable<AccesoResponse> {
    let p = new HttpParams().set('tipo_registro', params.tipo_registro);
    // La nube EXIGE id_puerta. El back local, si no va, usa la puerta de la estación
    // (la elegida en el front → KIOSK_PUERTA → 1ª del roster), así una estación sin
    // puerta configurada sigue fichando en vez de romper con un 422.
    if (params.id_puerta) p = p.set('id_puerta', params.id_puerta);
    if (params.id_dispositivo) p = p.set('id_dispositivo', params.id_dispositivo);
    if (params.latitud != null) p = p.set('latitud', params.latitud);
    if (params.longitud != null) p = p.set('longitud', params.longitud);

    const form = new FormData();
    imagenes.forEach((img, i) => form.append('fotos', img, `captura_${i + 1}.jpg`));

    return this.http.post<AccesoResponse>(`${SCANNER_URL}/scanner/acceso/liveness`, form, {
      params: p,
    });
  }
}

/**
 * Lectura de escaneos (GET /escaneos, GET /escaneos/{id}). Separado del
 * ScannerService porque es un recurso REST normal (scope `escaneos:read`),
 * no el flujo multipart del scanner.
 */
@Injectable({ providedIn: 'root' })
export class EscaneoService extends BaseCrud<EscaneoResponse> {
  protected readonly resource = 'escaneos';
}
