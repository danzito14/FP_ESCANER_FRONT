import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';

import { Dispositivo } from '../../core/interfaces/dispositivo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { AuthService } from '../../service/auth';
import { DispositivoService } from '../../service/dispositivo';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { ScannerConfigService } from '../../service/scanner-config';
import { VozService } from '../../service/voz';

@Component({
  selector: 'app-configuracion-page',
  imports: [DecimalPipe, FaIconComponent],
  templateUrl: './configuracion-page.html',
  styleUrl: './configuracion-page.scss',
})
export class ConfiguracionPage {
  private readonly auth = inject(AuthService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly dispositivoService = inject(DispositivoService);
  protected readonly voz = inject(VozService);
  protected readonly cfg = inject(ScannerConfigService);

  readonly iconVoz = faVolumeHigh;
  readonly iconMute = faVolumeXmark;

  readonly puertas = signal<PuertaAcceso[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);

  constructor() {
    this.auth.listarSiPuede('puertas', this.puertaService.list()).subscribe({
      next: (data) => this.puertas.set(data),
      error: () => {},
    });
    this.auth.listarSiPuede('dispositivos', this.dispositivoService.list()).subscribe({
      next: (data) => this.dispositivos.set(data),
      error: () => {},
    });
  }

  /** Activa/silencia la voz; al silenciar corta lo que se esté diciendo. */
  toggleVoz(): void {
    const activa = !this.voz.activa();
    this.voz.activa.set(activa);
    if (!activa) this.voz.callar();
  }
}
