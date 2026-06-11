import { Component, PLATFORM_ID, inject, input, output, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import * as L from 'leaflet';
import 'leaflet-draw';

import { Coordenada, wktToCoords, wktToPoint } from '../../core/utils/geo';
import { GeolocationService } from '../../service/geolocation';

/**
 * Mapa editable para seleccionar un punto (mode='point') o dibujar un área
 * (mode='polygon') con leaflet-draw. Emite las coordenadas en `coordsChange`.
 * Solo se renderiza en el navegador (SSR-safe).
 */
@Component({
  selector: 'app-map-picker',
  imports: [LeafletModule],
  templateUrl: './map-picker.html',
  styleUrl: './map-picker.scss',
  host: { ngSkipHydration: 'true' },
})
export class MapPicker {
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly geo = inject(GeolocationService);

  readonly mode = input<'point' | 'polygon'>('point');
  /** Geometría inicial en WKT (para edición). */
  readonly wkt = input<string | null | undefined>(null);
  readonly coordsChange = output<Coordenada[]>();

  readonly locating = signal(false);
  readonly geoError = signal<string | null>(null);

  private map: L.Map | null = null;
  private drawn: L.FeatureGroup | null = null;

  readonly options: L.MapOptions = {
    layers: [
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }),
    ],
    zoom: 14,
    center: L.latLng(25.7129, -108.7218),
  };

  onMapReady(map: L.Map): void {
    this.map = map;
    const drawn = new L.FeatureGroup();
    this.drawn = drawn;
    map.addLayer(drawn);
    this.preload(drawn);

    const isPoint = this.mode() === 'point';
    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: isPoint ? ({ color: '#ff6427' } as L.CircleMarkerOptions) : false,
        polygon: isPoint
          ? false
          : ({
              allowIntersection: true,
              showArea: false,
              shapeOptions: { color: '#3b82f6', weight: 2 },
            } as L.DrawOptions.PolygonOptions),
      },
      edit: { featureGroup: drawn, remove: true },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e) => {
      // Solo una geometría: reemplaza la anterior.
      drawn.clearLayers();
      drawn.addLayer((e as L.DrawEvents.Created).layer);
      this.emit();
    });
    map.on(L.Draw.Event.EDITED, () => this.emit());
    map.on(L.Draw.Event.DELETED, () => this.emit());

    setTimeout(() => map.invalidateSize(), 0);
  }

  /** Obtiene la ubicación actual del dispositivo y la coloca como punto. */
  async useMyLocation(): Promise<void> {
    if (!this.map || !this.drawn) return;
    this.locating.set(true);
    this.geoError.set(null);
    try {
      const pos = await this.geo.getCurrentPosition();
      this.drawn.clearLayers();
      this.drawn.addLayer(
        L.circleMarker([pos.lat, pos.lng], {
          color: '#ff6427',
          radius: 8,
          weight: 3,
          fillOpacity: 0.6,
        }),
      );
      this.map.setView([pos.lat, pos.lng], 17);
      this.coordsChange.emit([{ lat: pos.lat, lng: pos.lng }]);
    } catch (e) {
      this.geoError.set(e instanceof Error ? e.message : 'No se pudo obtener la ubicación.');
    } finally {
      this.locating.set(false);
    }
  }

  private preload(drawn: L.FeatureGroup): void {
    const w = this.wkt();
    if (!w) return;

    if (this.mode() === 'point') {
      const p = wktToPoint(w);
      if (p) {
        drawn.addLayer(
          L.circleMarker([p.lat, p.lng], {
            color: '#ff6427',
            radius: 8,
            weight: 3,
            fillOpacity: 0.6,
          }),
        );
        this.map?.setView([p.lat, p.lng], 16);
      }
    } else {
      const ring = wktToCoords(w).map((c) => [c.lat, c.lng] as [number, number]);
      if (ring.length) {
        const poly = L.polygon(ring, { color: '#3b82f6', weight: 2, fillOpacity: 0.2 });
        drawn.addLayer(poly);
        this.map?.fitBounds(poly.getBounds(), { padding: [24, 24], maxZoom: 17 });
      }
    }
  }

  private emit(): void {
    if (!this.drawn) return;
    const coords: Coordenada[] = [];

    this.drawn.eachLayer((layer) => {
      if (layer instanceof L.Polygon) {
        const ring = layer.getLatLngs()[0] as L.LatLng[];
        for (const ll of ring) coords.push({ lat: ll.lat, lng: ll.lng });
      } else if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        const ll = layer.getLatLng();
        coords.push({ lat: ll.lat, lng: ll.lng });
      }
    });

    this.coordsChange.emit(coords);
  }
}
