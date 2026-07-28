import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { TipoRegistro } from '../core/interfaces/common';

const KEY = 'scanner_config';

/** Calidad/resolución de la cámara. */
export type CalidadCamara = 'sd' | 'hd' | 'fhd' | 'max';
/** Alcance de detección (corto = cercano/estricto, largo = más sensible/lejano). */
export type AlcanceDeteccion = 'corto' | 'largo';
/**
 * Tipo de fichaje del dispositivo (define qué roster baja el kiosko offline).
 * 'mixto' = oficina + empaque juntos (lugares con entrada compartida).
 */
export type TipoFichaje = 'campo' | 'oficina' | 'empaque' | 'mixto';

interface ScannerCfg {
  idPuerta: number;
  idDispositivo: number;
  tipoRegistro: TipoRegistro;
  tipoFichaje: TipoFichaje;
  camaraId: string;
  calidad: CalidadCamara;
  alcance: AlcanceDeteccion;
  maxRostros: number;
  livenessOffline: boolean;
}

/** Límites de rostros simultáneos. */
export const MIN_ROSTROS = 3;
export const MAX_ROSTROS = 10;

/**
 * Configuración del scanner (puerta, tipo de registro, dispositivo) compartida
 * entre la página de Configuración y el Scanner, persistida en localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ScannerConfigService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Electron: lo marca el preload (ver electron/preload.cjs), con respaldo por user-agent. */
  private esEscritorio(): boolean {
    if (!this.isBrowser) return false;
    const flag = (globalThis as unknown as { kioskoPC?: { escritorio?: boolean } }).kioskoPC;
    return !!flag?.escritorio || /electron/i.test(globalThis.navigator?.userAgent ?? '');
  }

  readonly idPuerta = signal(0);
  readonly idDispositivo = signal(0);
  readonly tipoRegistro = signal<TipoRegistro>('entrada');
  /** Tipo de fichaje del dispositivo (campo|oficina|empaque); lo usa el kiosko offline. */
  readonly tipoFichaje = signal<TipoFichaje>('oficina');
  /** deviceId de la cámara elegida ('' = predeterminada / frontal). */
  readonly camaraId = signal('');
  /**
   * Resolución pedida a la cámara. En escritorio arranca en Full HD: hay CPU de sobra
   * y una webcam decente entrega más detalle, que es lo que necesita el filtro de
   * nitidez del reconocimiento. En tableta/web se queda en HD por memoria.
   */
  readonly calidad = signal<CalidadCamara>(this.esEscritorio() ? 'fhd' : 'hd');
  /** Alcance de detección de rostros (por defecto largo, acorde a HD). */
  readonly alcance = signal<AlcanceDeteccion>('largo');
  /** Rostros que se detectan/escanean a la vez (entre MIN_ROSTROS y MAX_ROSTROS). */
  readonly maxRostros = signal(MIN_ROSTROS);
  /** Aplicar la prueba de vida (anti-foto) on-device en el escáner OFFLINE. Experimental
   *  (default OFF porque el modelo aún no está calibrado y rechaza caras reales). */
  readonly livenessOffline = signal(false);

  constructor() {
    this.cargar();
    if (this.isBrowser) {
      effect(() => {
        const cfg: ScannerCfg = {
          idPuerta: this.idPuerta(),
          idDispositivo: this.idDispositivo(),
          tipoRegistro: this.tipoRegistro(),
          tipoFichaje: this.tipoFichaje(),
          camaraId: this.camaraId(),
          calidad: this.calidad(),
          alcance: this.alcance(),
          maxRostros: this.maxRostros(),
          livenessOffline: this.livenessOffline(),
        };
        localStorage.setItem(KEY, JSON.stringify(cfg));
        // Espejo a las claves individuales que lee el kit offline (eventos/geofence/descarga).
        localStorage.setItem('id_puerta', String(this.idPuerta()));
        localStorage.setItem('id_dispositivo', String(this.idDispositivo()));
        localStorage.setItem('tipo_registro', this.tipoRegistro());
        localStorage.setItem('tipo_fichaje', this.tipoFichaje());
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
      if (
        c.tipoFichaje === 'campo' || c.tipoFichaje === 'oficina' ||
        c.tipoFichaje === 'empaque' || c.tipoFichaje === 'mixto'
      ) {
        this.tipoFichaje.set(c.tipoFichaje);
      }
      if (typeof c.camaraId === 'string') this.camaraId.set(c.camaraId);
      if (c.calidad && ['sd', 'hd', 'fhd', 'max'].includes(c.calidad)) {
        this.calidad.set(c.calidad);
      }
      if (c.alcance === 'corto' || c.alcance === 'largo') this.alcance.set(c.alcance);
      if (typeof c.maxRostros === 'number') {
        this.maxRostros.set(Math.min(MAX_ROSTROS, Math.max(MIN_ROSTROS, Math.round(c.maxRostros))));
      }
      if (typeof c.livenessOffline === 'boolean') this.livenessOffline.set(c.livenessOffline);
    } catch {
      // Config corrupta: se ignora.
    }
  }
}
