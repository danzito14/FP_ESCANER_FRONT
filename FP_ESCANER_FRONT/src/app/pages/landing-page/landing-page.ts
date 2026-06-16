import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRightLong,
  faBuilding,
  faClipboardCheck,
  faDoorOpen,
  faLocationDot,
  faMicrochip,
  faTriangleExclamation,
  faUser,
  faUserGear,
  faUsers,
  faExpand,
} from '@fortawesome/free-solid-svg-icons';

import { Dashboard } from '../../components/dashboard/dashboard';
import { AuthService } from '../../service/auth';

interface Modulo {
  titulo: string;
  descripcion: string;
  ruta: string;
  icono: IconDefinition;
  scope: string;
}

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, FaIconComponent, Dashboard],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.scss',
})
export class LandingPage {
  private readonly auth = inject(AuthService);

  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly puedeVerDashboard = this.auth.puedeVerDashboard;
  readonly flecha = faArrowRightLong;

  private readonly modulos: Modulo[] = [
    { titulo: 'Usuarios', descripcion: 'Cuentas y roles del sistema', ruta: '/usuarios', icono: faUser, scope: 'usuarios:read' },
    { titulo: 'Roles', descripcion: 'Permisos y scopes', ruta: '/roles', icono: faUserGear, scope: 'roles:read' },
    { titulo: 'Trabajadores', descripcion: 'Personal y rostro registrado', ruta: '/trabajadores', icono: faUsers, scope: 'trabajadores:read' },
    { titulo: 'Empresas', descripcion: 'Organizaciones y ubicación', ruta: '/empresas', icono: faBuilding, scope: 'empresas:read' },
    { titulo: 'Áreas de trabajo', descripcion: 'Zonas y horarios', ruta: '/areas', icono: faLocationDot, scope: 'areas:read' },
    { titulo: 'Dispositivos', descripcion: 'Escáneres y lectores', ruta: '/dispositivos', icono: faMicrochip, scope: 'dispositivos:read' },
    { titulo: 'Puertas', descripcion: 'Puntos de acceso', ruta: '/puertas', icono: faDoorOpen, scope: 'puertas:read' },
    { titulo: 'Asistencias', descripcion: 'Registros de entrada/salida', ruta: '/asistencias', icono: faClipboardCheck, scope: 'asistencias:read' },
    { titulo: 'Incidencias', descripcion: 'Revisión y seguimiento', ruta: '/incidencias', icono: faTriangleExclamation, scope: 'incidencias:read' },
    { titulo: 'Scanner', descripcion: 'Reconocimiento facial', ruta: '/scanner', icono: faExpand, scope: 'scanner:use' },
  ];

  /** Módulos que el usuario puede abrir según sus scopes. */
  readonly modulosVisibles = computed(() => this.modulos.filter((m) => this.auth.tieneScope(m.scope)));
}
