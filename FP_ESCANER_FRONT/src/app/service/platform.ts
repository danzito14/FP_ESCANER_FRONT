import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type PlatformType = 'server' | 'web' | 'native' | 'electron';

/**
 * Detecta el entorno de ejecución: servidor (SSR), web (navegador),
 * native (APK/Capacitor) o electron (kiosko de escritorio). La detección es en
 * runtime, así que el mismo bundle sirve para los tres frontales.
 *
 * `isNative` = APK: es el ÚNICO entorno con el plugin FaceEngine, así que el flujo
 * offline (/descarga → /escaneo) solo existe ahí. Escritorio y web reconocen contra
 * un backend (kiosk_local :8100 y la nube, respectivamente).
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly isBrowser = isPlatformBrowser(this.platformId);
  readonly isServer = !this.isBrowser;
  readonly isNative = this.detectNative();
  readonly isElectron = !this.isNative && this.detectElectron();
  readonly isWeb = this.isBrowser && !this.isNative && !this.isElectron;

  readonly type: PlatformType = this.isServer
    ? 'server'
    : this.isNative
      ? 'native'
      : this.isElectron
        ? 'electron'
        : 'web';

  /**
   * Ruta de inicio del usuario kiosko (solo escáner) según el entorno:
   * APK → flujo offline; escritorio → backend local; web → escáner de nube.
   */
  get rutaKiosko(): string {
    return this.isNative ? '/descarga' : this.isElectron ? '/kiosko-pc' : '/scanner';
  }

  private detectNative(): boolean {
    if (!this.isBrowser) return false;
    // Capacitor inyecta window.Capacitor en el webview de la APK.
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean; isNative?: boolean } })
      .Capacitor;
    if (!cap) return false;
    return typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : !!cap.isNative;
  }

  private detectElectron(): boolean {
    if (!this.isBrowser) return false;
    // El preload de Electron expone window.kioskoPC (ver electron/preload.cjs);
    // el user-agent es el respaldo por si el preload no cargó.
    const flag = (globalThis as unknown as { kioskoPC?: { escritorio?: boolean } }).kioskoPC;
    if (flag?.escritorio) return true;
    const ua = globalThis.navigator?.userAgent ?? '';
    return /electron/i.test(ua);
  }
}
