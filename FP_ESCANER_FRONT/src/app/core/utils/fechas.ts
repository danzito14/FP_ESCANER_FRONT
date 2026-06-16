/** Formatea una fecha como 'YYYY-MM-DD' en hora local (para inputs date y el backend). */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Rango por defecto: desde hace 7 días hasta hoy (inclusive). */
export function rangoUltimaSemana(): { inicio: string; fin: string } {
  const fin = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 7);
  return { inicio: ymd(inicio), fin: ymd(fin) };
}
