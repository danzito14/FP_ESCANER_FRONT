/**
 * Resumen de asistencia del día (GET /asistencias/resumen-dia).
 *
 * Contadores presentes/esperados por categoría + total de la empresa.
 * - presentes: trabajadores DISTINTOS con una entrada `exitoso` en la fecha.
 * - esperados: trabajadores `estado='activo'` de esa categoría en la empresa.
 * - total: TODOS los activos de la empresa (no la suma de categorías; hay
 *   administrativos/general/super que cuentan en total pero en ninguna categoría).
 *
 * Categorías (derivadas del trabajador, definidas por el backend):
 *   campo   = permiso_escaneo='campo'
 *   oficina = nivel_acceso_interno IN ('oficina','mixto')
 *   empaque = nivel_acceso_interno IN ('empaque','mixto')   ('mixto' cuenta en ambas)
 */
export interface ResumenCategoria {
  /** Clave estable (oficina/empaque/campo/…). */
  clave: string;
  /** Etiqueta para mostrar. */
  etiqueta: string;
  presentes: number;
  esperados: number;
}

export interface ResumenDia {
  /** Fecha del resumen ('YYYY-MM-DD'). */
  fecha: string;
  /** Empresa del resumen (null = todas, solo aplica para super-admin). */
  id_empresa?: number | null;
  total: { presentes: number; esperados: number };
  categorias: ResumenCategoria[];
}
