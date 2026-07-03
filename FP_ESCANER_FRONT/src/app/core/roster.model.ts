export interface RosterTrabajador {
  id_trabajador: number;
  id_emp: string | null;
  origen_nomina: string | null;
  nombre: string;
  apellido: string;
  permiso_escaneo: string;
  id_area: number | null;
  embedding: number[];          // 512 floats (buffalo_l)
  calidad: number | null;
  modelo_ia: string | null;
}
export interface RosterArea {
  id_area: number; nombre_area: string;
  tipo_area: string | null; poligono_geojson: string | null;
}
export interface RosterPuerta {
  id_puerta: number; nombre_puerta: string;
  tipo_puerta: string; id_area: number | null;
}
export interface RosterResponse {
  empresa: number; tipo: string; roster_version: string;
  total_trabajadores: number;
  trabajadores: RosterTrabajador[];
  areas: RosterArea[]; puertas: RosterPuerta[];
}
