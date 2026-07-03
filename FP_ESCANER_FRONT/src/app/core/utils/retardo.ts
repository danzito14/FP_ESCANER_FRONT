/** Minutos → "X hrs Y min" (o "Y min" si <60, "X hrs" si es exacto). */
export function fmtMinutosRetardo(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hrs`;
  return `${h} hrs ${m} min`;
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' sin desfase de zona horaria (fechas de solo día). */
export function fechaCortaLocal(f: string): string {
  const [y, m, d] = f.split('-');
  return d && m && y ? `${d}/${m}/${y}` : f;
}
