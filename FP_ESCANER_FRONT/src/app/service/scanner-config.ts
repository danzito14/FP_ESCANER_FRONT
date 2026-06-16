import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { TipoRegistro } from '../core/interfaces/common';

const KEY = 'scanner_config';

interface ScannerCfg {
  idPuerta: number;
  idDispositivo: number;
  tipoRegistro: TipoRegistro;
  camaraId: string;
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

  constructor() {
    this.cargar();
    if (this.isBrowser) {
      effect(() => {
        const cfg: ScannerCfg = {
          idPuerta: this.idPuerta(),
          idDispositivo: this.idDispositivo(),
          tipoRegistro: this.tipoRegistro(),
          camaraId: this.camaraId(),
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
    } catch {
      // Config corrupta: se ignora.
    }
  }
}
