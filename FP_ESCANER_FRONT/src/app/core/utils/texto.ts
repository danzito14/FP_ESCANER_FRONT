/** ¿Alguno de los campos contiene el texto buscado? (case-insensitive). Vacío = sí. */
export function incluyeTexto(query: string, ...campos: unknown[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return campos.some((c) => String(c ?? '').toLowerCase().includes(q));
}
