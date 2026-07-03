import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { Sidebar } from './components/sidebar/sidebar';
import { DebugLog } from './components/debug-log/debug-log';
import { AuthService } from './service/auth';
import { LayoutService } from './service/layout';
import { LogService } from './core/log.service';
import { ConexionService } from './core/conexion.service';
import { SubidaService } from './core/subida.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Sidebar, DebugLog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly layout = inject(LayoutService);
  protected readonly title = signal('FP_ESCANER_FRONT');
  private readonly router = inject(Router);
  private readonly log = inject(LogService);
  private readonly conexion = inject(ConexionService);
  private readonly subida = inject(SubidaService);

  constructor() {
    // Registra cada navegación en el log en vivo.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.log.info(`🧭 ${e.urlAfterRedirects}`));
    // Monitoreo de conexión (auto-switch online/offline).
    this.conexion.iniciar();
    // Subida automática de pendientes en toda la app (no solo en el escáner).
    this.subida.iniciarAuto();
  }
}
