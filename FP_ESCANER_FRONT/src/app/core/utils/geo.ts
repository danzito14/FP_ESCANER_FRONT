/** Punto lat/lng usado en los formularios. */
export interface Coordenada {
  lat: number;
  lng: number;
}

/** Par [longitud, latitud] (orden GeoJSON) como lo espera/devuelve el backend. */
export type LngLat = [number, number];

/** Convierte puntos {lat,lng} a pares [lng, lat] para el backend. */
export function coordsToLngLat(coords: Coordenada[]): LngLat[] {
  return coords.map((c) => [c.lng, c.lat]);
}

/** Convierte pares [lng, lat] del backend a puntos {lat,lng}. */
export function lngLatToCoords(pairs?: LngLat[] | null): Coordenada[] {
  if (!pairs) return [];
  return pairs
    .filter((p) => p?.[0] != null && p?.[1] != null)
    .map(([lng, lat]) => ({ lat, lng }));
}

/** Construye un POLYGON WKT a partir de pares [lng, lat]. */
export function lngLatToWkt(pairs?: LngLat[] | null): string | undefined {
  return coordsToWkt(lngLatToCoords(pairs));
}

/**
 * Construye un POLYGON WKT (PostGIS) a partir de puntos lat/lng.
 * El anillo se cierra automáticamente (primer punto == último).
 * Formato de salida: "POLYGON ((lng lat, lng lat, ...))".
 *
 * NOTA: el backend usa geography(Polygon, 4326). Si tu API espera otro
 * formato (p. ej. GeoJSON o un arreglo de coordenadas), ajusta esta función.
 */
export function coordsToWkt(coords: Coordenada[]): string | undefined {
  if (!coords.length) return undefined;

  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) {
    ring.push(first); // cerrar el anillo
  }

  const pts = ring.map((c) => `${c.lng} ${c.lat}`).join(', ');
  return `POLYGON ((${pts}))`;
}

/** Construye un POINT WKT a partir de un punto lat/lng. Formato: "POINT (lng lat)". */
export function pointToWkt(coord?: Coordenada | null): string | undefined {
  if (!coord) return undefined;
  return `POINT (${coord.lng} ${coord.lat})`;
}

/**
 * Área geodésica de un polígono (en hectáreas) a partir de puntos lat/lng.
 * Usa la fórmula esférica (misma de leaflet-draw). Devuelve 0 si hay < 3 puntos.
 */
export function polygonAreaHectares(coords: Coordenada[]): number {
  const n = coords.length;
  if (n < 3) return 0;
  const R = 6378137; // radio terrestre en metros
  const rad = Math.PI / 180;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    area +=
      (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
  }
  area = (area * R * R) / 2;
  return Math.abs(area) / 10000; // m² → hectáreas
}

/** Determina si un punto cae dentro de un polígono (algoritmo ray-casting). */
export function pointInPolygon(point: Coordenada, ring: Coordenada[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Parsea un POINT WKT a un punto lat/lng. */
export function wktToPoint(wkt?: string | null): Coordenada | null {
  if (!wkt) return null;
  const match = wkt.match(/POINT\s*\(([^)]+)\)/i);
  if (!match) return null;
  const [lng, lat] = match[1].trim().split(/\s+/).map(Number);
  return { lat, lng };
}

/** Parsea un POLYGON WKT a puntos lat/lng (descarta el punto de cierre duplicado). */
export function wktToCoords(wkt?: string | null): Coordenada[] {
  if (!wkt) return [];

  const match = wkt.match(/\(\(([^)]+)\)\)/);
  if (!match) return [];

  const pts = match[1]
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .map(([lng, lat]) => ({ lat, lng }));

  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) pts.pop();
  }
  return pts;
}
