import { Component, PLATFORM_ID, effect, inject, input, output, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import * as L from 'leaflet';
import 'leaflet-draw';

import { Coordenada, wktToCoords, wktToPoint } from '../../core/utils/geo';
import {
  ETIQUETA_CALLE,
  ETIQUETA_SATELITE,
  capaCalle,
  capaSatelite,
} from '../../core/utils/map-layers';
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
  /** Polígono de contexto (ej. el área): se dibuja como guía y centra el mapa. */
  readonly contexto = input<string | null | undefined>(null);
  readonly coordsChange = output<Coordenada[]>();

  readonly locating = signal(false);
  readonly geoError = signal<string | null>(null);

  private map: L.Map | null = null;
  private drawn: L.FeatureGroup | null = null;
  private contextoLayer: L.Polygon | null = null;

  constructor() {
    // Redibuja/centra en el contexto (área) cuando cambia.
    effect(() => {
      const wkt = this.contexto();
      if (this.map) this.pintarContexto(wkt);
    });
  }

  // Capas base: calle (default) y satélite, alternables desde el control del mapa.
  private readonly capaCalle = capaCalle();
  private readonly capaSatelite = capaSatelite();

  readonly options: L.MapOptions = {
    layers: [this.capaCalle],
    zoom: 14,
    center: L.latLng(25.7129, -108.7218),
  };

  onMapReady(map: L.Map): void {
    this.map = map;
    // Selector de capa base: Calle / Satélite (radios arriba a la derecha).
    L.control
      .layers(
        { [ETIQUETA_CALLE]: this.capaCalle, [ETIQUETA_SATELITE]: this.capaSatelite },
        undefined,
        { position: 'topright' },
      )
      .addTo(map);
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
        circlemarker: isPoint ? ({ color: '#245640' } as L.CircleMarkerOptions) : false,
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

    // Nombres de evento como string: NO dependen de L.Draw (que en el bundle de
    // producción puede quedar undefined y romper el enganche del listener).
    map.on('draw:created', (e) => {
      // Solo una geometría: reemplaza la anterior.
      drawn.clearLayers();
      drawn.addLayer((e as L.DrawEvents.Created).layer);
      this.emit();
    });
    map.on('draw:edited', () => this.emit());
    map.on('draw:deleted', () => this.emit());

    this.pintarContexto(this.contexto());

    // El mapa suele inicializar con tamaño 0 dentro de un modal (animación):
    // recalcula varias veces y, si es polígono nuevo, arranca el dibujo solo.
    for (const ms of [0, 200, 450]) setTimeout(() => map.invalidateSize(), ms);
    if (!isPoint && !this.wkt()) {
      setTimeout(() => this.iniciarDibujo(), 500);
    }
  }

  /**
   * Activa la herramienta de dibujo de polígono "haciendo clic" en el botón del
   * toolbar de leaflet-draw (robusto: no depende de L.Draw, que puede quedar
   * undefined en el bundle de producción).
   */
  iniciarDibujo(): void {
    const btn = this.map
      ?.getContainer()
      .querySelector<HTMLElement>('.leaflet-draw-draw-polygon');
    btn?.click();
  }

  /** Dibuja el polígono de contexto (área) como guía y centra el mapa en él. */
  private pintarContexto(wkt: string | null | undefined): void {
    if (!this.map) return;
    if (this.contextoLayer) {
      this.map.removeLayer(this.contextoLayer);
      this.contextoLayer = null;
    }
    const ring = wktToCoords(wkt).map((c) => [c.lat, c.lng] as [number, number]);
    if (!ring.length) return;
    this.contextoLayer = L.polygon(ring, {
      color: '#3b82f6',
      weight: 2,
      dashArray: '6 4',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(this.map);
    this.map.fitBounds(this.contextoLayer.getBounds(), {
      padding: [24, 24],
      maxZoom: 18,
      animate: false,
    });
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
          color: '#245640',
          radius: 8,
          weight: 3,
          fillOpacity: 0.6,
        }),
      );
      this.map.setView([pos.lat, pos.lng], 17, { animate: false });
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
            color: '#245640',
            radius: 8,
            weight: 3,
            fillOpacity: 0.6,
          }),
        );
        this.map?.setView([p.lat, p.lng], 16, { animate: false });
      }
    } else {
      const ring = wktToCoords(w).map((c) => [c.lat, c.lng] as [number, number]);
      if (ring.length) {
        const poly = L.polygon(ring, { color: '#3b82f6', weight: 2, fillOpacity: 0.2 });
        drawn.addLayer(poly);
        this.map?.fitBounds(poly.getBounds(), { padding: [24, 24], maxZoom: 17, animate: false });
      }
    }
  }

  private emit(): void {
    if (!this.drawn) return;
    const coords: Coordenada[] = [];

    this.drawn.eachLayer((layer) => {
      if (layer instanceof L.Polygon) {
        // getLatLngs puede venir como LatLng[] o LatLng[][] según la versión.
        const latlngs = layer.getLatLngs() as L.LatLng[] | L.LatLng[][];
        const ring = (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs) as L.LatLng[];
        for (const ll of ring) coords.push({ lat: ll.lat, lng: ll.lng });
      } else if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        const ll = layer.getLatLng();
        coords.push({ lat: ll.lat, lng: ll.lng });
      }
    });

    this.coordsChange.emit(coords);
  }
}
