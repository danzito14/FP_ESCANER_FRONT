import { Component, Injector, afterNextRender, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { firstValueFrom } from 'rxjs';

import { Dispositivo } from '../../core/interfaces/dispositivo';
import { AccesoParams, AccesoResponse } from '../../core/interfaces/escaneo';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { AuthService } from '../../service/auth';
import { dataUrlToBlob } from '../../service/camera';
import { DispositivoService } from '../../service/dispositivo';
import { ScannerService } from '../../service/escaneo';
import { GeolocationService } from '../../service/geolocation';
import { PlatformService } from '../../service/platform';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { Frame, ScannerBase, Track, VOZ_RECHAZO, vozAprobado } from './scanner-base';

/**
 * Escáner de NUBE: detecta con MediaPipe (motor común en ScannerBase) y manda la
 * ráfaga completa al liveness del backend, que reconoce y registra el fichaje.
 */
@Component({
  selector: 'app-scanner-page',
  imports: [DecimalPipe, RouterLink, FaIconComponent],
  templateUrl: './scanner-page.html',
  styleUrl: './scanner-page.scss',
})
export class ScannerPage extends ScannerBase {
  private readonly geo = inject(GeolocationService);
  private readonly scanner = inject(ScannerService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly dispositivoService = inject(DispositivoService);
  private readonly auth = inject(AuthService);
  private readonly plataforma = inject(PlatformService);
  private readonly injector = inject(Injector);

  readonly puertas = signal<PuertaAcceso[]>([]);
  readonly dispositivos = signal<Dispositivo[]>([]);

  private lat?: number;
  private lng?: number;

  constructor() {
    super();
    // Solo para el resumen (nombres). Carga con :read o con scanner:use.
    this.auth
      .listarSiAlguno(['puertas:read', 'scanner:use'], this.puertaService.list())
      .subscribe({ next: (data) => this.puertas.set(data), error: () => {} });
    this.auth
      .listarSiAlguno(['dispositivos:read', 'scanner:use'], this.dispositivoService.list())
      .subscribe({ next: (data) => this.dispositivos.set(data), error: () => {} });

    // ESTACIÓN DESATENDIDA: abre la cámara sola al entrar, sin pulsar "Iniciar". Es lo
    // que hace que tras un corte de luz el kiosko quede listo para fichar sin nadie
    // delante. Solo en escritorio (Electron), donde el permiso de cámara está concedido
    // por el proceso principal y no aparece ningún diálogo; en web/APK se conserva el
    // botón, porque el navegador exige un gesto del usuario para abrir la cámara.
    if (this.cfg.autoIniciar() && this.plataforma.isElectron) {
      afterNextRender(() => { void this.iniciar(); }, { injector: this.injector });
    }
  }

  /** Nombre de la puerta configurada (para el resumen). */
  puertaNombre(): string {
    const id = this.cfg.idPuerta();
    if (!id) return '';
    return this.puertas().find((p) => p.id_puerta === id)?.nombre_puerta ?? `#${id}`;
  }

  /** Nombre del dispositivo configurado (para el resumen). */
  dispositivoNombre(): string {
    const id = this.cfg.idDispositivo();
    if (!id) return '';
    return this.dispositivos().find((d) => d.id_dispositivo === id)?.nombre_dispositivo ?? `#${id}`;
  }

  protected override validarInicio(): string | null {
    return this.cfg.idPuerta() ? null : 'Configura una puerta en Configuración antes de iniciar.';
  }

  protected override async prepararDeteccion(): Promise<void> {
    try {
      const pos = await this.geo.getCurrentPosition();
      this.lat = pos.lat;
      this.lng = pos.lng;
    } catch {
      this.lat = undefined;
      this.lng = undefined;
    }
  }

  /** Manda la ráfaga completa al liveness de la nube (mejor score primero). */
  protected override async enviarCara(t: Track, capturas: Frame[]): Promise<void> {
    const frames = [...capturas].sort((a, b) => b.score - a.score);
    const scoreMejor = frames[0]?.score ?? t.box.score;
    try {
      const params: AccesoParams = {
        id_puerta: this.cfg.idPuerta(),
        tipo_registro: this.cfg.tipoRegistro(),
        id_dispositivo: this.cfg.idDispositivo() || undefined,
        latitud: this.lat,
        longitud: this.lng,
      };
      const blobs = frames.map((f) => dataUrlToBlob(f.dataUrl));
      const res = await firstValueFrom(this.scanner.acceso(params, blobs));
      t.estado = res.acceso ? 'ok' : 'rechazado';
      this.mostrarResultado(t.id, res, scoreMejor);
    } catch (e) {
      t.estado = 'rechazado';
      this.notificar(`Cara ${t.id} error: ${this.msg(e)}`);
      this.mostrarResultado(
        t.id,
        {
          acceso: false,
          mensaje: this.msg(e),
          trabajador: null,
          id_escaneo: null,
          estado_registro: 'error',
        },
        scoreMejor,
      );
    }
  }

  private mostrarResultado(cara: number, res: AccesoResponse, scoreFallback: number): void {
    const nombre = res.trabajador
      ? `${res.trabajador.nombre} ${res.trabajador.apellido}`
      : 'No reconocido';
    const conf = res.confianza != null ? res.confianza : scoreFallback;
    // Motivo claro según el verdicto del backend (no_rostro/spoof/no_match).
    const motivo = this.motivoRechazo(res);

    this.toastPush({
      cara,
      exito: res.acceso,
      nombre,
      pct: conf != null ? Math.round(conf * 100) : null,
      mensaje: motivo ?? res.mensaje,
      // La voz solo identifica a quien pasa; el motivo del rechazo no se dice en voz alta.
      frase: res.acceso
        ? vozAprobado(res.trabajador?.nombre, res.trabajador?.apellido)
        : VOZ_RECHAZO,
    });
  }

  /** Mensaje claro de rechazo según el verdicto del backend (si lo trae). */
  private motivoRechazo(res: AccesoResponse): string | null {
    if (res.acceso) return null;
    switch (res.resultado) {
      case 'no_rostro':
        return 'No se detectó un rostro válido.';
      case 'spoof':
        return 'Posible foto o suplantación.';
      case 'no_match':
        return 'Rostro no reconocido.';
      default:
        return null;
    }
  }
}
