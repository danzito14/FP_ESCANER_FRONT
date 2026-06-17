import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { TipoRegistro } from '../core/interfaces/common';

const KEY = 'scanner_config';

/** Calidad/resolución de la cámara. */
export type CalidadCamara = 'sd' | 'hd' | 'fhd' | 'max';
/** Alcance de detección (corto = cercano/estricto, largo = más sensible/lejano). */
export type AlcanceDeteccion = 'corto' | 'largo';

interface ScannerCfg {
  idPuerta: number;
  idDispositivo: number;
  tipoRegistro: TipoRegistro;
  camaraId: string;
  calidad: CalidadCamara;
  alcance: AlcanceDeteccion;
}

/**
 * Configuración del scanner (puerta, tipo de registro, dispositivo) compartida
 * entre la página de Configuración y el Scanner, persistida en localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ScannerConfigService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly idPuerta = signal(0);
  readonly idDispositivo = signal(0);
  readonly tipoRegistro = signal<TipoRegistro>('entrada');
  /** deviceId de la cámara elegida ('' = predeterminada / frontal). */
  readonly camaraId = signal('');
  /** Resolución pedida a la cámara (por defecto HD 720p). */
  readonly calidad = signal<CalidadCamara>('hd');
  /** Alcance de detección de rostros (por defecto largo, acorde a HD). */
  readonly alcance = signal<AlcanceDeteccion>('largo');

  constructor() {
    this.cargar();
    if (this.isBrowser) {
      effect(() => {
        const cfg: ScannerCfg = {
          idPuerta: this.idPuerta(),
          idDispositivo: this.idDispositivo(),
          tipoRegistro: this.tipoRegistro(),
          camaraId: this.camaraId(),
          calidad: this.calidad(),
          alcance: this.alcance(),
        };
        localStorage.setItem(KEY, JSON.stringify(cfg));
      });
    }
  }

  private cargar(): void {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as Partial<ScannerCfg>;
      if (typeof c.idPuerta === 'number') this.idPuerta.set(c.idPuerta);
      if (typeof c.idDispositivo === 'number') this.idDispositivo.set(c.idDispositivo);
      if (c.tipoRegistro === 'entrada' || c.tipoRegistro === 'salida') {
        this.tipoRegistro.set(c.tipoRegistro);
      }
      if (typeof c.camaraId === 'string') this.camaraId.set(c.camaraId);
      if (c.calidad && ['sd', 'hd', 'fhd', 'max'].includes(c.calidad)) {
        this.calidad.set(c.calidad);
      }
      if (c.alcance === 'corto' || c.alcance === 'largo') this.alcance.set(c.alcance);
    } catch {
      // Config corrupta: se ignora.
    }
  }
}
