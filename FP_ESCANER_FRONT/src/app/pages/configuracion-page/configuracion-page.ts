import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faBug,
  faCamera,
  faCircleCheck,
  faCircleXmark,
  faDatabase,
  faRotate,
  faVolumeHigh,
  faVolumeXmark,
  faWifi,
} from '@fortawesome/free-solid-svg-icons';

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
import { ConexionService, ModoConexion } from '../../core/conexion.service';
import { DbService } from '../../core/db.service';
import { ModeloService } from '../../core/modelo.service';
import { SyncService } from '../../core/sync.service';
import { SubidaService } from '../../core/subida.service';
import { LogService } from '../../core/log.service';

interface ResumenDatos {
  modelo: boolean;
  trabajadores: number;
  areas: number;
  puertas: number;
  rosterVersion: string | null;
  pendientes: number;
}

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
  protected readonly conexion = inject(ConexionService);
  private readonly db = inject(DbService);
  private readonly modelo = inject(ModeloService);
  protected readonly sync = inject(SyncService);
  private readonly subida = inject(SubidaService);
  protected readonly log = inject(LogService);
  /** Solo el super-admin ve/activa el panel de logs. */
  readonly esAdmin = this.auth.esAdmin;
  readonly subiendo = signal(false);

  readonly iconVoz = faVolumeHigh;
  readonly iconMute = faVolumeXmark;
  readonly iconCamara = faCamera;
  readonly iconDatos = faDatabase;
  readonly iconWifi = faWifi;
  readonly iconOk = faCircleCheck;
  readonly iconNo = faCircleXmark;
  readonly iconSync = faRotate;
  readonly iconBug = faBug;

  /** Verificación de datos para escanear offline. */
  readonly datos = signal<ResumenDatos | null>(null);
  readonly verificando = signal(false);
  readonly sincronizando = signal(false);
  /** true = está todo lo necesario para escanear offline. */
  readonly datosListo = computed(() => {
    const d = this.datos();
    return !!d && d.modelo && d.trabajadores > 0 && d.areas > 0 && d.puertas > 0;
  });
  /** ¿La config del dispositivo (puerta) está puesta? */
  readonly puertaOk = computed(() => this.cfg.idPuerta() > 0);

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
    // Verifica los datos offline al abrir.
    this.verificar();
  }

  /** Re-lee qué hay descargado (modelo + roster) para escanear offline. */
  async verificar(): Promise<void> {
    this.verificando.set(true);
    try {
      const [modelo, r] = await Promise.all([this.modelo.modeloEnDisco(), this.db.resumenDatos()]);
      this.datos.set({ modelo, ...r });
    } catch {
      this.datos.set(null);
    } finally {
      this.verificando.set(false);
    }
  }

  /** Fuerza la descarga/actualización de modelo + roster y re-verifica. */
  async resincronizar(): Promise<void> {
    this.sincronizando.set(true);
    try {
      await this.sync.bootstrap(this.cfg.tipoFichaje(), true);
    } finally {
      this.sincronizando.set(false);
      await this.verificar();
    }
  }

  /** Sube ahora los eventos pendientes (asistencias/intentos) al servidor. */
  async subirAhora(): Promise<void> {
    this.subiendo.set(true);
    try { await this.subida.subirPendientes(); }
    finally { this.subiendo.set(false); await this.verificar(); }
  }

  setModo(m: ModoConexion): void {
    this.conexion.setModo(m);
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
