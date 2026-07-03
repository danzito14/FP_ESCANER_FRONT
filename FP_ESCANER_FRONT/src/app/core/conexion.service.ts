import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Network } from '@capacitor/network';

import { LogService } from './log.service';

export type ModoConexion = 'auto' | 'online' | 'offline';

const KEY_MODO = 'conexion_modo';
const INTERVALO_MS = 60_000; // re-chequeo de red cada 1 min (respaldo del listener instantáneo)

/**
 * Estado de conexión del kiosko y modo (auto/online/offline).
 * - `auto`: sigue la red real (Network) → offline cuando no hay internet.
 * - `online`/`offline`: forzado manualmente desde Configuración.
 * `offline()` decide a qué escáner ir (offline `/escaneo` vs online `/scanner`).
 */
@Injectable({ providedIn: 'root' })
export class ConexionService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly log = inject(LogService);

  readonly modo = signal<ModoConexion>(this.leerModo());
  readonly hayInternet = signal(true);

  /** true = el kiosko debe operar OFFLINE (por modo manual o por falta de red en 'auto'). */
  readonly offline = computed(() => {
    const m = this.modo();
    if (m === 'offline') return true;
    if (m === 'online') return false;
    return !this.hayInternet(); // auto
  });

  private timer?: ReturnType<typeof setInterval>;
  private iniciado = false;

  /** Arranca el monitoreo (idempotente, solo en browser/APK). Llamar una vez desde App. */
  async iniciar(): Promise<void> {
    if (this.iniciado || !this.isBrowser) return;
    this.iniciado = true;
    await this.chequear();
    Network.addListener('networkStatusChange', (st) => this.setInternet(st.connected));
    this.timer = setInterval(() => this.chequear(), INTERVALO_MS);
    this.log.info(`⚙ modo conexión = ${this.modo()}`);
  }

  setModo(m: ModoConexion): void {
    this.modo.set(m);
    try { localStorage.setItem(KEY_MODO, m); } catch {}
    this.log.info(`⚙ modo conexión = ${m} → ${this.offline() ? 'OFFLINE' : 'ONLINE'}`);
  }

  private async chequear(): Promise<void> {
    try { this.setInternet((await Network.getStatus()).connected); }
    catch { this.setInternet(false); }
  }

  private setInternet(v: boolean): void {
    if (this.hayInternet() === v) return;
    this.hayInternet.set(v);
    const sufijo = this.modo() === 'auto' ? ` → ${this.offline() ? 'OFFLINE' : 'ONLINE'}` : '';
    this.log.info(`🌐 internet: ${v ? 'sí' : 'no'}${sufijo}`);
  }

  private leerModo(): ModoConexion {
    if (typeof localStorage === 'undefined') return 'auto';
    const m = localStorage.getItem(KEY_MODO) as ModoConexion | null;
    return m === 'online' || m === 'offline' ? m : 'auto';
  }
}
