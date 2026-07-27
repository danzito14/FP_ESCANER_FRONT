import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { TipoRegistro } from '../core/interfaces/common';
import {
  KioskAccesoResponse,
  KioskConfig,
  KioskConfigParcial,
  KioskEstado,
  KioskIdentificarResponse,
  KioskRosterSyncResponse,
  KioskSyncEventosResponse,
} from '../core/interfaces/kiosko-local';

/** Base del backend local. '' en dev (proxy) → http://localhost:8100 en escritorio. */
const BASE = environment.kioskLocalUrl;

/**
 * Cliente del backend LOCAL del kiosko de escritorio (`kiosk_local`, :8100).
 * Reconoce local-first y sincroniza solo; el front solo hace HTTP a localhost.
 * Ver docs/PLAN_KIOSKO_ESCRITORIO_BACKEND.md.
 */
@Injectable({ providedIn: 'root' })
export class KioskoLocalService {
  private readonly http = inject(HttpClient);

  /** Estado del nodo local: nº de trabajadores/embeddings, empresa y conexión. */
  estado(): Observable<KioskEstado> {
    return this.http.get<KioskEstado>(`${BASE}/kiosk/estado`);
  }

  /** Baja el roster de la nube a la BD local (requiere internet). `tipo` de fichaje. */
  rosterSync(tipo?: string): Observable<KioskRosterSyncResponse> {
    let p = new HttpParams();
    if (tipo) p = p.set('tipo', tipo);
    return this.http.post<KioskRosterSyncResponse>(`${BASE}/kiosk/roster/sync`, null, { params: p });
  }

  /**
   * Ficha con UNA foto: reconoce local; si no hay match y hay internet, cae a la
   * nube. Registra el evento en la cola local. Es el endpoint principal.
   */
  acceso(
    foto: Blob,
    opts: { tipoRegistro: TipoRegistro; idPuerta?: number },
  ): Observable<KioskAccesoResponse> {
    let p = new HttpParams().set('tipo_registro', opts.tipoRegistro);
    if (opts.idPuerta) p = p.set('id_puerta', opts.idPuerta);
    const form = new FormData();
    form.append('foto', foto, 'captura.jpg');
    return this.http.post<KioskAccesoResponse>(`${BASE}/kiosk/acceso`, form, { params: p });
  }

  /**
   * Ficha con una RÁFAGA de 3–5 capturas (campo `fotos`): además de reconocer, el
   * backend local compara los frames entre sí para exigir movimiento real, así una
   * foto impresa o en pantalla no pasa. Es el endpoint preferido; `acceso()` (una
   * sola imagen) queda para casos puntuales.
   */
  accesoLiveness(
    fotos: Blob[],
    opts: { tipoRegistro: TipoRegistro; idPuerta?: number },
  ): Observable<KioskAccesoResponse> {
    let p = new HttpParams().set('tipo_registro', opts.tipoRegistro);
    if (opts.idPuerta) p = p.set('id_puerta', opts.idPuerta);
    const form = new FormData();
    fotos.forEach((f, i) => form.append('fotos', f, `captura_${i + 1}.jpg`));
    return this.http.post<KioskAccesoResponse>(`${BASE}/kiosk/acceso/liveness`, form, {
      params: p,
    });
  }

  /** Dice quién es SIN registrar (para pruebas / previsualización). */
  identificar(foto: Blob): Observable<KioskIdentificarResponse> {
    const form = new FormData();
    form.append('foto', foto, 'captura.jpg');
    return this.http.post<KioskIdentificarResponse>(`${BASE}/kiosk/identificar`, form);
  }

  /** Umbrales que usa el reconocimiento AHORA (para el panel de calibración). */
  config(): Observable<KioskConfig> {
    return this.http.get<KioskConfig>(`${BASE}/kiosk/config`);
  }

  /**
   * Ajusta umbrales en caliente (sin recrear el contenedor). Se manda SOLO lo que
   * cambió y responde la config efectiva ya aplicada. Un 502 significa que se guardó
   * pero `recognition` no contestó.
   */
  guardarConfig(cambios: KioskConfigParcial): Observable<KioskConfig> {
    return this.http.post<KioskConfig>(`${BASE}/kiosk/config`, cambios);
  }

  /** Fuerza subir YA la cola local a la nube (además del loop automático). */
  syncEventos(): Observable<KioskSyncEventosResponse> {
    return this.http.post<KioskSyncEventosResponse>(`${BASE}/kiosk/sync/eventos`, null);
  }
}
