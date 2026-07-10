import { Component } from '@angular/core';

/**
 * Botón flotante de ayuda (esquina inferior derecha). En reposo es un círculo blanco
 * con "?"; al pasar el cursor se extiende y muestra "Ir a la guía del sistema" en verde.
 * Abre la guía estática (public/guia-sistema.html) en una pestaña nueva.
 */
@Component({
  selector: 'app-help-fab',
  templateUrl: './help-fab.html',
  styleUrl: './help-fab.scss',
})
export class HelpFab {}
