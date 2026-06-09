/** Punto lat/lng usado en los formularios. */
export interface Coordenada {
  lat: number;
  lng: number;
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
