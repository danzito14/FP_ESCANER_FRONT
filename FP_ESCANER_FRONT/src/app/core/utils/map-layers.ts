import { TileLayer, tileLayer } from 'leaflet';

/**
 * Capas base reutilizables para los mapas (map-view / map-picker).
 *
 * Cada función devuelve una instancia NUEVA: una capa de Leaflet no se puede
 * compartir entre dos mapas a la vez, así que cada componente crea las suyas.
 */

/** Capa de calles (OpenStreetMap). */
export function capaCalle(): TileLayer {
  return tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  });
}

/** Capa de imagen satelital (Esri World Imagery, sin API key). */
export function capaSatelite(): TileLayer {
  return tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
    },
  );
}

/** Etiquetas para el control de capas de Leaflet (Calle por defecto). */
export const ETIQUETA_CALLE = 'Calle';
export const ETIQUETA_SATELITE = 'Satélite';
