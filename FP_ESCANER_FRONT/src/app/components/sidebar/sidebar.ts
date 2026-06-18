import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBuilding,
  faChartColumn,
  faClipboardCheck,
  faDoorOpen,
  faExpand,
  faGear,
  faLocationDot,
  faMicrochip,
  faTriangleExclamation,
  faUser,
  faUserGear,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';

import { AuthService } from '../../service/auth';
import { LayoutService } from '../../service/layout';

interface NavItem {
  titulo: string;
  ruta: string;
  icono: IconDefinition;
  /** Scope necesario para ver/entrar (read del recurso o scanner:use). */
  scope: string;
}

/** Navegación lateral global (pegada a la izquierda y colapsable). */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, FaIconComponent],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  host: { '[class.oculto]': 'layout.sidebarOculto()' },
})
export class Sidebar {
  protected readonly layout = inject(LayoutService);
  private readonly auth = inject(AuthService);

  private readonly todos: NavItem[] = [
    { titulo: 'Usuarios', ruta: '/usuarios', icono: faUser, scope: 'usuarios:read' },
    { titulo: 'Roles', ruta: '/roles', icono: faUserGear, scope: 'roles:read' },
    { titulo: 'Trabajadores', ruta: '/trabajadores', icono: faUsers, scope: 'trabajadores:read' },
    { titulo: 'Empresas', ruta: '/empresas', icono: faBuilding, scope: 'empresas:read' },
    { titulo: 'Áreas de trabajo', ruta: '/areas', icono: faLocationDot, scope: 'areas:read' },
    { titulo: 'Dispositivos', ruta: '/dispositivos', icono: faMicrochip, scope: 'dispositivos:read' },
    { titulo: 'Puertas', ruta: '/puertas', icono: faDoorOpen, scope: 'puertas:read' },
    { titulo: 'Asistencias', ruta: '/asistencias', icono: faClipboardCheck, scope: 'asistencias:read' },
    { titulo: 'Incidencias', ruta: '/incidencias', icono: faTriangleExclamation, scope: 'incidencias:read' },
    { titulo: 'Reportes', ruta: '/reportes', icono: faChartColumn, scope: 'reportes:read' },
    { titulo: 'Scanner', ruta: '/scanner', icono: faExpand, scope: 'scanner:use' },
  ];

  /** Solo los ítems que el usuario puede ver según sus scopes. */
  readonly items = computed(() => this.todos.filter((i) => this.auth.tieneScope(i.scope)));

  /** Configuración: disponible para cualquier usuario con sesión. */
  readonly iconConfig = faGear;
}
