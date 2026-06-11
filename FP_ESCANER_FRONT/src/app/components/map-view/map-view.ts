import { Component, PLATFORM_ID, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import {
  Layer,
  Map as LeafletMap,
  MapOptions,
  circleMarker,
  latLng,
  latLngBounds,
  polygon,
  tileLayer,
} from 'leaflet';

import { wktToCoords, wktToPoint } from '../../core/utils/geo';

/** Elemento geográfico a dibujar en el mapa. */
export interface MapFeature {
  id: number | string;
  /** Geometría en WKT (POINT o POLYGON). */
  wkt?: string | null;
  label?: string;
  /** Color del trazo/relleno (CSS). Si no se indica, gris neutro. */
  color?: string;
}

/**
 * Mapa de solo lectura que dibuja puntos (POINT) y áreas (POLYGON) a partir de WKT.
 * Usa vectores (circleMarker / polygon) para no depender de los iconos de Leaflet.
 * Se renderiza únicamente en el navegador (SSR-safe).
 */
@Component({
  selector: 'app-map-view',
  imports: [LeafletModule],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
  host: { ngSkipHydration: 'true' },
})
export class MapView {
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly features = input<MapFeature[]>([]);
  readonly selectedId = input<number | string | null>(null);

  private map: LeafletMap | null = null;
  readonly layers = signal<Layer[]>([]);

  readonly options: MapOptions = {
    layers: [
      tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }),
    ],
    zoom: 13,
    center: latLng(25.7129, -108.7218),
  };

  constructor() {
    effect(() => {
      const feats = this.features();
      const sel = this.selectedId();
      if (this.isBrowser) this.render(feats, sel);
    });
  }

  onMapReady(map: LeafletMap): void {
    this.map = map;
    // El contenedor puede montarse con tamaño 0; recalcular tras el render.
    setTimeout(() => map.invalidateSize(), 0);
    this.render(this.features(), this.selectedId());
  }

  private render(feats: MapFeature[], sel: number | string | null): void {
    const layers: Layer[] = [];
    const allPoints: [number, number][] = [];
    const selPoints: [number, number][] = [];

    for (const f of feats) {
      const isSel = sel != null && f.id === sel;
      const color = f.color ?? '#5b6472';

      const point = wktToPoint(f.wkt);
      if (point) {
        const ll: [number, number] = [point.lat, point.lng];
        layers.push(
          circleMarker(ll, {
            radius: isSel ? 10 : 6,
            color,
            fillColor: color,
            fillOpacity: isSel ? 0.95 : 0.7,
            weight: isSel ? 3 : 2,
          }).bindTooltip(f.label ?? `#${f.id}`),
        );
        allPoints.push(ll);
        if (isSel) selPoints.push(ll);
        continue;
      }

      const ring = wktToCoords(f.wkt).map((c) => [c.lat, c.lng] as [number, number]);
      if (ring.length) {
        layers.push(
          polygon(ring, {
            color,
            weight: isSel ? 3 : 2,
            fillOpacity: isSel ? 0.35 : 0.15,
          }).bindTooltip(f.label ?? `#${f.id}`),
        );
        allPoints.push(...ring);
        if (isSel) selPoints.push(...ring);
      }
    }

    this.layers.set(layers);
    this.fit(selPoints.length ? selPoints : allPoints);
  }

  private fit(points: [number, number][]): void {
    if (!this.map || !points.length) return;
    if (points.length === 1) {
      this.map.setView(points[0], 16);
    } else {
      this.map.fitBounds(latLngBounds(points), { padding: [28, 28], maxZoom: 17 });
    }
  }
}
