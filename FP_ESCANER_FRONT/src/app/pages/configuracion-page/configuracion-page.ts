import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faCamera, faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';

import { Dispositivo } from '../../core/interfaces/dispositivo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { AuthService } from '../../service/auth';
import { CameraService, etiquetaCamara } from '../../service/camera';
import { DispositivoService } from '../../service/dispositivo';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import {
  CalidadCamara,
  MAX_ROSTROS,
  MIN_ROSTROS,
  ScannerConfigService,
} from '../../service/scanner-config';
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
  readonly iconCamara = faCamera;

  /** Opciones de rostros simultáneos (MIN_ROSTROS..MAX_ROSTROS). */
  readonly opcionesRostros = Array.from(
    { length: MAX_ROSTROS - MIN_ROSTROS + 1 },
    (_, i) => MIN_ROSTROS + i,
  );

  readonly puertas = signal<PuertaAcceso[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);
  readonly camaras = signal<MediaDeviceInfo[]>([]);
  readonly detectandoCam = signal(false);

  /** Cámaras con nombre legible (frontal/trasera/USB…) y sin nombres repetidos. */
  readonly camarasOpts = computed(() => {
    const base = this.camaras().map((c, i) => ({
      id: c.deviceId,
      nombre: etiquetaCamara(c.label, i),
    }));
    const repetidos = new Map<string, number>();
    for (const o of base) repetidos.set(o.nombre, (repetidos.get(o.nombre) ?? 0) + 1);
    const usados = new Map<string, number>();
    return base.map((o) => {
      if ((repetidos.get(o.nombre) ?? 0) <= 1) return o;
      const n = (usados.get(o.nombre) ?? 0) + 1;
      usados.set(o.nombre, n);
      return { id: o.id, nombre: `${o.nombre} ${n}` };
    });
  });

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


  /** Cambia la calidad y ajusta el alcance: HD+ → largo, SD → corto. */
  onCalidad(v: CalidadCamara): void {
    this.cfg.calidad.set(v);
    this.cfg.alcance.set(v === 'sd' ? 'corto' : 'largo');
  }

  /** Activa/silencia la voz; al silenciar corta lo que se esté diciendo. */
  toggleVoz(): void {
    const activa = !this.voz.activa();
    this.voz.activa.set(activa);
    if (!activa) this.voz.callar();
  }
}
