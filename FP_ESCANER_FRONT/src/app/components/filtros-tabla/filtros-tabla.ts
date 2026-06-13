import { Component, input, model } from '@angular/core';

import { AreaTrabajo } from '../../core/interfaces/area-trabajo';
import { Empresa } from '../../core/interfaces/empresa';

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

  readonly empresa = model(0);
  readonly area = model(0);
  readonly texto = model('');

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
}
