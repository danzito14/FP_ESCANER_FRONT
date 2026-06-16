import { Component, input, model } from '@angular/core';

import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { Empresa } from '../../core/interfaces/empresa';
import { colorEstado } from '../../core/utils/estado-color';

/**
 * Barra de filtros reutilizable. Empresa/Área solo se muestran para admin;
 * el buscador (texto, client-side) se muestra siempre.
 */
@Component({
  selector: 'app-filtros-tabla',
  imports: [],
  templateUrl: './filtros-tabla.html',
})
export class FiltrosTabla {
  readonly esAdmin = input(false);
  readonly empresas = input<Empresa[]>([]);
  readonly areas = input<AreaTrabajo[]>([]);
  readonly mostrarArea = input(true);
  /** Estados disponibles para el filtro de chips (vacío = sin filtro de estado). */
  readonly estados = input<string[]>([]);
  /** Conteo por estado (opcional, para mostrar la cantidad en cada chip). */
  readonly conteos = input<Record<string, number> | null>(null);
  /** Total para el chip "Todas" (opcional). */
  readonly total = input<number | null>(null);
  /** Si es true, muestra el estado como chips (con punto de color) en vez de select. */
  readonly chips = input(false);
  /** Tipos disponibles para un segundo grupo de chips (opcional). */
  readonly tipos = input<string[]>([]);
  readonly conteosTipo = input<Record<string, number> | null>(null);
  /** Si es true, muestra el rango de fechas (Desde / Hasta). */
  readonly fechas = input(false);

  readonly colorEstado = colorEstado;

  readonly empresa = model(0);
  readonly area = model(0);
  readonly texto = model('');
  readonly estado = model('');
  readonly tipo = model('');
  readonly fechaInicio = model('');
  readonly fechaFin = model('');

  onEmpresa(e: Event): void {
    this.empresa.set(+(e.target as HTMLSelectElement).value);
    this.area.set(0); // resetea el área al cambiar de empresa
  }

  onArea(e: Event): void {
    this.area.set(+(e.target as HTMLSelectElement).value);
  }

  onBuscar(e: Event): void {
    this.texto.set((e.target as HTMLInputElement).value);
  }

  onFechaInicio(e: Event): void {
    this.fechaInicio.set((e.target as HTMLInputElement).value);
  }

  onFechaFin(e: Event): void {
    this.fechaFin.set((e.target as HTMLInputElement).value);
  }

  onEstado(e: Event): void {
    this.estado.set((e.target as HTMLSelectElement).value);
  }

  toggleEstado(e: string): void {
    this.estado.set(this.estado() === e ? '' : e);
  }

  toggleTipo(t: string): void {
    this.tipo.set(this.tipo() === t ? '' : t);
  }

  conteoDe(e: string): number {
    return this.conteos()?.[e] ?? 0;
  }

  conteoTipoDe(t: string): number {
    return this.conteosTipo()?.[t] ?? 0;
  }
}
