import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type PlatformType = 'server' | 'web' | 'native';

/**
 * Detecta el entorno de ejecución: servidor (SSR), web (navegador) o
 * native (APK/Capacitor). La detección de native es en runtime, así que
 * funciona aunque todavía no se haya añadido Capacitor (por ahora = web).
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly isBrowser = isPlatformBrowser(this.platformId);
  readonly isServer = !this.isBrowser;
  readonly isNative = this.detectNative();
  readonly isWeb = this.isBrowser && !this.isNative;

  readonly type: PlatformType = this.isServer ? 'server' : this.isNative ? 'native' : 'web';

  private detectNative(): boolean {
    if (!this.isBrowser) return false;
    // Capacitor inyecta window.Capacitor en el webview de la APK.
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean; isNative?: boolean } })
      .Capacitor;
    if (!cap) return false;
    return typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : !!cap.isNative;
  }
}
