import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Modulo {
  titulo: string;
  descripcion: string;
  ruta: string;
  icono: string;
}

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.scss',
})
export class LandingPage {
  readonly modulos: Modulo[] = [
    { titulo: 'Usuarios', descripcion: 'Cuentas y roles del sistema', ruta: '/usuarios', icono: '👤' },
    { titulo: 'Trabajadores', descripcion: 'Personal y rostro registrado', ruta: '/trabajadores', icono: '🧑‍🏭' },
    { titulo: 'Empresas', descripcion: 'Organizaciones y ubicación', ruta: '/empresas', icono: '🏢' },
    { titulo: 'Áreas de trabajo', descripcion: 'Zonas y horarios', ruta: '/areas', icono: '📍' },
    { titulo: 'Dispositivos', descripcion: 'Escáneres y lectores', ruta: '/dispositivos', icono: '📟' },
    { titulo: 'Puertas', descripcion: 'Puntos de acceso', ruta: '/puertas', icono: '🚪' },
    { titulo: 'Asistencias', descripcion: 'Registros de entrada/salida', ruta: '/asistencias', icono: '🕒' },
    { titulo: 'Incidencias', descripcion: 'Revisión y seguimiento', ruta: '/incidencias', icono: '⚠️' },
  ];
}
