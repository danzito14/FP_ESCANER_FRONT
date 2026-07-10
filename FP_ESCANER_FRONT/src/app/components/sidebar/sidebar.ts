import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRightFromBracket,
  faBuilding,
  faChartColumn,
  faClipboardCheck,
  faDoorOpen,
  faExpand,
  faGear,
  faHouse,
  faLocationDot,
  faMicrochip,
  faTriangleExclamation,
  faUser,
  faUserGear,
  faUserPlus,
  faUsers,
  faUserShield,
  faXmark,
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
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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
    // Oculto por el momento (la info también está en Incidencias). Para reactivar, descomenta:
    // { titulo: 'Intentos', ruta: '/intentos', icono: faUserShield, scope: 'incidencias:read' },
    { titulo: 'Reportes', ruta: '/reportes', icono: faChartColumn, scope: 'reportes:read' },
    { titulo: 'Scanner', ruta: '/scanner', icono: faExpand, scope: 'scanner:use' },
  ];

  /** Kiosko puro = puede escanear pero no ver el panel. */
  private readonly esKiosko = computed(
    () => this.auth.puedeUsarScanner() && !this.auth.puedeVerDashboard(),
  );

  /**
   * Ítems visibles: si es kiosko, SIEMPRE el escáner offline (/escaneo, que busca local
   * primero y cae al servidor solo como fallback si hay internet) + Enrolar. Si no, los del admin.
   */
  readonly items = computed<NavItem[]>(() => {
    if (this.esKiosko()) {
      return [
        { titulo: 'Escáner', ruta: '/escaneo', icono: faExpand, scope: 'scanner:use' },
        { titulo: 'Registrar rostro', ruta: '/enrolar', icono: faUserPlus, scope: 'scanner:use' },
      ];
    }
    return this.todos.filter((i) => this.auth.tieneScope(i.scope));
  });

  /** Configuración: disponible para cualquier usuario con sesión. */
  readonly iconConfig = faGear;
  readonly iconHome = faHouse;
  readonly iconClose = faXmark;
  readonly iconLogout = faArrowRightFromBracket;

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
