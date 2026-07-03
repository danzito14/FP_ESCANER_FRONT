import { Injectable, inject, signal } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { environment } from '../../environments/environment';
import { DbService } from './db.service';
import { AuthService } from './auth.service';
import { ModeloService } from './modelo.service';
import { RosterResponse } from './roster.model';
import { LogService } from './log.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private db = inject(DbService);
  private auth = inject(AuthService);
  private modelo = inject(ModeloService);
  private log = inject(LogService);

  progreso = signal(0);
  mensaje  = signal('Preparando…');
  estado   = signal<'idle' | 'trabajando' | 'listo' | 'error'>('idle');

  /** Deja el dispositivo listo: FASE 1 modelo IA (1ª vez) + FASE 2 roster. */
  async bootstrap(tipo: string, forzar = false): Promise<boolean> {
    this.estado.set('trabajando'); this.progreso.set(0);
    this.log.info(`⏳ bootstrap(tipo=${tipo}${forzar ? ', forzar' : ''})`);
    try {
      await this.db.init();

      // FASE 1 — modelo de reconocimiento (~167MB, solo la 1ª vez)
      this.mensaje.set('Descargando modelo de reconocimiento…');
      this.log.info('FASE 1 — modelo de reconocimiento');
      const okModelo = await this.modelo.asegurar(pct => this.progreso.set(pct));
      if (!okModelo) return this.err('No se pudo obtener el modelo (revisa el log).');

      // FASE 2 — roster
      this.progreso.set(0);
      this.mensaje.set('Descargando datos…');
      this.log.info('FASE 2 — roster');
      const online = (await Network.getStatus()).connected;
      const versionLocal = await this.db.getMeta('roster_version');
      const hayDatos = (await this.db.contarTrabajadores()) > 0;

      if (!online) {
        this.log.warn(`sin red; datos en disco: ${hayDatos}`);
        if (hayDatos) return this.ok();
        return this.err('Sin conexión y sin datos descargados. Conéctate una vez.');
      }

      this.log.net(`→ GET off_sync/roster?tipo=${tipo}`);
      const res = await CapacitorHttp.get({
        url: `${environment.apiUrl}/off_sync/roster`,
        params: { tipo },
        headers: { Authorization: `Bearer ${this.auth.token}` },
      });
      this.log.add(res.status === 200 ? 'ok' : 'error', `← ${res.status} roster`);
      if (res.status === 401) return this.err('Sesión no válida. Vuelve a iniciar sesión.');
      if (res.status !== 200) throw new Error(`Roster HTTP ${res.status}`);
      const roster = res.data as RosterResponse;

      if (!forzar && hayDatos && roster.roster_version === versionLocal) {
        this.log.info('roster al día (misma versión) → no re-guarda');
        return this.ok();
      }

      this.mensaje.set('Alistando todo…');
      this.log.info(`guardando roster: ${roster.trabajadores?.length ?? 0} trabajadores`);
      await this.db.guardarRoster(roster, pct => this.progreso.set(pct));
      return this.ok();
    } catch (e: any) {
      this.log.error(`✕ bootstrap: ${e?.message ?? e}`);
      if ((await this.db.contarTrabajadores()) > 0) return this.ok();  // fallback: opera con lo cacheado
      return this.err('No se pudo preparar el dispositivo. Revisa tu conexión.');
    }
  }

  private ok()  { this.progreso.set(100); this.mensaje.set('Listo'); this.estado.set('listo'); this.log.ok('✓ dispositivo listo'); return true; }
  private err(m: string) { this.mensaje.set(m); this.estado.set('error'); this.log.error(`✕ ${m}`); return false; }
}
