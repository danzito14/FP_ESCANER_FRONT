import { Component, PLATFORM_ID, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import {
  Layer,
  Map as LeafletMap,
  MapOptions,
  circleMarker,
  control,
  latLng,
  latLngBounds,
  polygon,
} from 'leaflet';

import { wktToCoords, wktToPoint } from '../../core/utils/geo';
import {
  ETIQUETA_CALLE,
  ETIQUETA_SATELITE,
  capaCalle,
  capaSatelite,
} from '../../core/utils/map-layers';

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

  // Capas base: calle (default) y satélite, alternables desde el control del mapa.
  private readonly capaCalle = capaCalle();
  private readonly capaSatelite = capaSatelite();

  readonly options: MapOptions = {
    layers: [this.capaCalle],
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
    // Selector de capa base: Calle / Satélite (radios arriba a la derecha).
    control
      .layers(
        { [ETIQUETA_CALLE]: this.capaCalle, [ETIQUETA_SATELITE]: this.capaSatelite },
        undefined,
        { position: 'topright' },
      )
      .addTo(map);
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
    if (!this.map) return;
    // animate:false evita el bug de Leaflet "_leaflet_pos undefined" al reencuadrar
    // mientras el mapa se recalcula (cambios de filtro/estado).
    try {
      if (points.length === 1) {
        this.map.setView(points[0], 16, { animate: false });
      } else if (points.length > 1) {
        this.map.fitBounds(latLngBounds(points), {
          padding: [28, 28],
          maxZoom: 17,
          animate: false,
        });
      }
    } catch {
      // El mapa puede no estar listo en ciertos reflows; se ignora con seguridad.
    }
  }
}
