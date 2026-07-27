import { Injectable, inject } from '@angular/core';

import { PlatformService } from './platform';

/** API que expone el preload de Electron (ver electron/preload.cjs). */
interface PuenteKioskoPC {
  escritorio?: boolean;
  pantallaCompleta?: (on: boolean) => Promise<void>;
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
}
