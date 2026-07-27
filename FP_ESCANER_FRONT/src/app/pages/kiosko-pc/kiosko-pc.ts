import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import { firstValueFrom } from 'rxjs';

import { KioskAccesoResponse, KioskEstado } from '../../core/interfaces/kiosko-local';
import { PuertaAcceso } from '../../core/interfaces/puerta-acceso';
import { AuthService } from '../../service/auth';
import { dataUrlToBlob } from '../../service/camera';
import { KioskoLocalService } from '../../service/kiosko-local';
import { PuertaAccesoService } from '../../service/puerta-acceso';
import { Frame, ScannerBase, Track } from '../scanner-page/scanner-base';

/**
 * Escáner de la estación de ESCRITORIO (Electron/PC + webcam). Se comporta IGUAL que
 * el de nube — mismo motor (ScannerBase): varias caras a la vez, ráfaga de capturas,
 * overlay numerado, toasts y voz — pero ficha contra el backend LOCAL `kiosk_local`
 * (:8100), que reconoce local-first y cae a la nube solo si no hay match.
 *
 * Única diferencia real de contrato: `/kiosk/acceso` recibe UNA foto, así que de la
 * ráfaga se manda el mejor frame (no hay liveness multi-foto como en la nube).
 * Ver docs/PLAN_KIOSKO_ESCRITORIO_BACKEND.md.
 */
@Component({
  selector: 'app-kiosko-pc',
  standalone: true,
  imports: [DecimalPipe, RouterLink, FaIconComponent],
  templateUrl: './kiosko-pc.html',
  styleUrl: '../scanner-page/scanner-page.scss',
})
export class KioskoPcComponent extends ScannerBase implements OnInit {
  private readonly kiosko = inject(KioskoLocalService);
  private readonly puertaService = inject(PuertaAccesoService);
  private readonly auth = inject(AuthService);

  readonly iconSync = faRotate;

  /**
   * Ráfaga más espaciada que en la nube (~200 ms entre fotos, ~0.8 s en total): el
   * liveness local mide movimiento entre frames, y con 100 ms las capturas salen casi
   * idénticas y una cara real puede parecer una foto fija.
   */
  protected override readonly intervaloCapturaMs = 200;

  readonly estado = signal<KioskEstado | null>(null);
  readonly sincronizando = signal(false);
  readonly puertas = signal<PuertaAcceso[]>([]);

  ngOnInit(): void {
    this.cargarEstado();
    // El kiosko tiene scanner:use; puede o no tener puertas:read. Carga con cualquiera.
    this.auth
      .listarSiAlguno(['puertas:read', 'scanner:use'], this.puertaService.list())
      .subscribe({ next: (d) => this.puertas.set(d), error: () => {} });
  }

  /** Nombre de la puerta configurada (para el resumen). */
  puertaNombre(): string {
    const id = this.cfg.idPuerta();
    if (!id) return '';
    return this.puertas().find((p) => p.id_puerta === id)?.nombre_puerta ?? `#${id}`;
  }

  /**
   * La puerta configurada tiene que existir en el padrón de ESTA empresa: `kiosk_local`
   * la guarda como llave foránea, y un id de otra empresa (o que el roster local no bajó)
   * revienta el INSERT del fichaje con un 500 después de haber reconocido bien la cara.
   * Si aún no cargó la lista (sin red o sin permiso), no bloquea.
   */
  readonly puertaValida = computed(() => {
    const id = this.cfg.idPuerta();
    const lista = this.puertas();
    return !id || !lista.length || lista.some((p) => p.id_puerta === id);
  });

  protected override validarInicio(): string | null {
    if (this.puertaValida()) return null;
    return `La puerta configurada (#${this.cfg.idPuerta()}) no pertenece al padrón de esta estación. Elige una en Configuración antes de fichar.`;
  }

  private cargarEstado(): void {
    this.kiosko.estado().subscribe({
      next: (e) => this.estado.set(e),
      error: () => this.estado.set(null),
    });
  }

  async sincronizarRoster(): Promise<void> {
    if (this.sincronizando()) return;
    this.sincronizando.set(true);
    this.error.set(null);
    try {
      const r = await firstValueFrom(this.kiosko.rosterSync(this.cfg.tipoFichaje()));
      this.toastPush({
        cara: 0,
        exito: true,
        titulo: 'Padrón sincronizado',
        nombre: `${r.trabajadores} trabajadores`,
        pct: null,
      });
      this.cargarEstado();
    } catch (e) {
      this.error.set(`No se pudo sincronizar el padrón: ${this.msg(e)}`);
    } finally {
      this.sincronizando.set(false);
    }
  }

  /**
   * Manda la ráfaga completa (3–5 fotos, en orden de captura) al liveness del backend
   * local: el movimiento entre frames es lo que distingue una persona de una foto.
   */
  protected override async enviarCara(t: Track, frames: Frame[]): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.kiosko.accesoLiveness(
          frames.map((f) => dataUrlToBlob(f.dataUrl)),
          {
            tipoRegistro: this.cfg.tipoRegistro(),
            // Sin puerta válida se omite: el backend local usa la suya por defecto
            // (KIOSK_PUERTA / 1ª del roster) en vez de fallar por la llave foránea.
            idPuerta: (this.puertaValida() && this.cfg.idPuerta()) || undefined,
          },
        ),
      );
      t.estado = res.acceso ? 'ok' : 'rechazado';
      this.mostrarResultado(t.id, res, this.scoreMaximo(frames));
    } catch (e) {
      t.estado = 'rechazado';
      this.notificar(`Cara ${t.id} error: ${this.msg(e)}`);
      // 0 = no contestó (kiosk_local caído); 5xx = contestó pero falló al registrar.
      const status = (e as { status?: number })?.status ?? 0;
      this.toastPush({
        cara: t.id,
        exito: false,
        nombre: status >= 500 ? 'El kiosko no pudo registrar el fichaje' : 'Sin respuesta del kiosko',
        pct: null,
        mensaje: this.msg(e),
        frase:
          status >= 500
            ? 'No se pudo registrar el fichaje.'
            : 'No hay respuesta del kiosko.',
      });
    }
  }

  private mostrarResultado(cara: number, res: KioskAccesoResponse, scoreFallback: number): void {
    const nombre = res.trabajador
      ? `${res.trabajador.nombre} ${res.trabajador.apellido}`.trim()
      : 'No reconocido';
    const sim = res.trabajador?.similitud ?? res.confianza ?? scoreFallback;
    // El backend local ya manda mensajes hechos para el kiosko ("Mantén la cara en
    // cuadro un momento."); solo si viene vacío se usa el texto propio.
    const motivo = res.mensaje?.trim() || this.motivoRechazo(res);
    // Se marca de dónde salió el match: el fallback a la nube es más lento y conviene verlo.
    const via = res.origen === 'nube' ? ' (nube)' : '';

    this.toastPush({
      cara,
      exito: res.acceso,
      titulo: `Cara ${cara}: ${res.acceso ? 'Exitoso' : 'Rechazado'}${via}`,
      nombre,
      pct: sim != null ? Math.round(sim * 100) : null,
      mensaje: motivo ?? res.mensaje,
      frase: res.acceso
        ? `Aprobado, ${nombre}.`
        : (motivo ?? res.mensaje ?? 'Acceso denegado. Rostro no reconocido.'),
    });
  }

  /** Respaldo por si el backend no manda mensaje: texto según el verdicto local. */
  private motivoRechazo(res: KioskAccesoResponse): string | null {
    if (res.acceso) return null;
    switch (res.estado) {
      case 'no_rostro':
        return 'No se detectó un rostro válido.';
      case 'pocos_rostros':
        return 'No se te vio en suficientes fotos. Quédate frente a la cámara un momento.';
      case 'spoof':
        return 'Posible foto o suplantación.';
      case 'no_match':
        return 'Rostro no reconocido.';
      default:
        return null;
    }
  }
}
