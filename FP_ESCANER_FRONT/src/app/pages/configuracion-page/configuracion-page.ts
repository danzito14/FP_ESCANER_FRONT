import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';

import { Dispositivo } from '../../core/interfaces/dispositivo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { AuthService } from '../../service/auth';
import { CameraService } from '../../service/camera';
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
  private readonly camera = inject(CameraService);
  protected readonly voz = inject(VozService);
  protected readonly cfg = inject(ScannerConfigService);

  readonly iconVoz = faVolumeHigh;
  readonly iconMute = faVolumeXmark;

  readonly puertas = signal<PuertaAcceso[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);
  readonly camaras = signal<MediaDeviceInfo[]>([]);
  readonly detectandoCam = signal(false);

  constructor() {
    // Quien configura el scanner puede tener 'puertas:read'/'dispositivos:read'
    // (admin/config) o solo 'scanner:use' (kiosko). Carga con cualquiera.
    this.auth
      .listarSiAlguno(['puertas:read', 'scanner:use'], this.puertaService.list())
      .subscribe({ next: (data) => this.puertas.set(data), error: () => {} });
    this.auth
      .listarSiAlguno(['dispositivos:read', 'scanner:use'], this.dispositivoService.list())
      .subscribe({ next: (data) => this.dispositivos.set(data), error: () => {} });
    // Enumera cámaras ya disponibles (etiquetas vacías hasta dar permiso).
    this.camera.listarCamaras().then((c) => this.camaras.set(c));
  }

  /** Pide permiso de cámara para leer las etiquetas y lista las disponibles. */
  async detectarCamaras(): Promise<void> {
    this.detectandoCam.set(true);
    try {
      this.camaras.set(await this.camera.pedirPermisoYListar());
    } finally {
      this.detectandoCam.set(false);
    }
  }

  /** Etiqueta legible de una cámara (o un nombre genérico si no hay permiso). */
  nombreCamara(d: MediaDeviceInfo, i: number): string {
    return d.label || `Cámara ${i + 1}`;
  }

  /** Activa/silencia la voz; al silenciar corta lo que se esté diciendo. */
  toggleVoz(): void {
    const activa = !this.voz.activa();
    this.voz.activa.set(activa);
    if (!activa) this.voz.callar();
  }
}
