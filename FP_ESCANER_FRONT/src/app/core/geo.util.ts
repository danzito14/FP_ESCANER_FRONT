/** GeoJSON de ST_AsGeoJSON: coordenadas [lon, lat]. El server RE-AUDITA con PostGIS. */
export function dentroDeArea(lon: number, lat: number, geojson: string | null): boolean {
  if (!geojson) return false;
  try {
    const g = JSON.parse(geojson);
    const anillo = g.type === 'Polygon' ? g.coordinates?.[0]
                 : g.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null;
    if (!anillo) return false;
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
      if ((yi > lat) !== (yj > lat) &&
          lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  } catch { return false; }
}
