import { Injectable, inject } from '@angular/core';

import { PlatformService } from './platform';

export interface GeoPosition {
  lat: number;
  lng: number;
  /** Precisión en metros. */
  accuracy: number;
}

/**
 * Servicio de geolocalización agnóstico de la plataforma.
 * - Web: usa la API del navegador (`navigator.geolocation`).
 * - Native (APK): el webview de Capacitor también soporta `navigator.geolocation`;
 *   cuando se agregue Capacitor, cambiar la rama native a `@capacitor/geolocation`.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private readonly platform = inject(PlatformService);

  async getCurrentPosition(): Promise<GeoPosition> {
    if (this.platform.isServer) {
      throw new Error('La geolocalización no está disponible en el servidor.');
    }

    if (this.platform.isNative) {
      // TODO (APK): reemplazar por @capacitor/geolocation:
      //   const pos = await Geolocation.getCurrentPosition();
      //   return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      return this.webPosition();
    }

    return this.webPosition();
  }

  private webPosition(): Promise<GeoPosition> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Tu navegador no soporta geolocalización.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) => reject(new Error(this.mensajeError(err))),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  private mensajeError(err: GeolocationPositionError): string {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return 'Permiso de ubicación denegado.';
      case err.POSITION_UNAVAILABLE:
        return 'No se pudo determinar la ubicación.';
      case err.TIMEOUT:
        return 'Se agotó el tiempo para obtener la ubicación.';
      default:
        return 'Error al obtener la ubicación.';
    }
  }
}
