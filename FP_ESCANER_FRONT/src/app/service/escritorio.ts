import { Injectable, inject } from '@angular/core';

import { PlatformService } from './platform';

/** Config de ARRANQUE de la estación (la guarda el proceso principal en un JSON). */
export interface ConfigEstacion {
  /** Ruta de Angular que se abre al iniciar la app. '/scanner' = listo para fichar. */
  rutaInicio: string;
  /** Abrir directamente a pantalla completa (modo kiosko). */
  pantallaCompleta: boolean;
}

/** API que expone el preload de Electron (ver electron/preload.cjs). */
interface PuenteKioskoPC {
  escritorio?: boolean;
  pantallaCompleta?: (on: boolean) => Promise<void>;
  leerConfig?: () => Promise<ConfigEstacion>;
  guardarConfig?: (cfg: Partial<ConfigEstacion>) => Promise<ConfigEstacion>;
}

/**
 * Control de la ventana del kiosko de escritorio. Fuera de Electron todo es no-op,
 * así que las páginas pueden llamarlo sin preguntar por la plataforma.
 */
@Injectable({ providedIn: 'root' })
export class EscritorioService {
  private readonly plataforma = inject(PlatformService);

  private get puente(): PuenteKioskoPC | undefined {
    if (!this.plataforma.isBrowser) return undefined;
    return (globalThis as unknown as { kioskoPC?: PuenteKioskoPC }).kioskoPC;
  }

  /** Pantalla completa solo mientras el escáner captura; el resto de la app va en ventana. */
  pantallaCompleta(activar: boolean): void {
    void this.puente?.pantallaCompleta?.(activar);
  }

  /**
   * Config de arranque de ESTA estación. null fuera de Electron (web/APK), donde no hay
   * ventana que configurar. Los cambios se aplican al siguiente arranque de la app.
   */
  async leerConfig(): Promise<ConfigEstacion | null> {
    return (await this.puente?.leerConfig?.()) ?? null;
  }

  async guardarConfig(cfg: Partial<ConfigEstacion>): Promise<ConfigEstacion | null> {
    return (await this.puente?.guardarConfig?.(cfg)) ?? null;
  }
}
