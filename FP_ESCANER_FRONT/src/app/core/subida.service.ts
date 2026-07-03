import { Injectable, inject } from '@angular/core';
import { Network } from '@capacitor/network';
import { environment } from '../../environments/environment';
import { DbService } from './db.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

const s = (v: any) => (v === null || v === undefined ? '' : String(v));

const HEADER_ASIS = 'id_asistencia,id_trabajador,id_puerta,id_empresa,tipo_registro,' +
  'creado_en_cliente,confianza_biometrica,dentro_de_area,id_dispositivo_origen,latitud,longitud';
const filaAsis = (r: any) => [
  r.id_asistencia, r.id_trabajador, r.id_puerta, r.id_empresa, r.tipo_registro,
  r.creado_en_cliente, r.confianza_biometrica,
  r.dentro_de_area === null ? '' : (r.dentro_de_area ? 'true' : 'false'),
  r.id_dispositivo_origen, r.latitud, r.longitud,
].map(s).join(',');

const HEADER_INT = 'id_intento,id_puerta,id_empresa,tipo,id_trabajador,similitud,' +
  'creado_en_cliente,id_dispositivo_origen,latitud,longitud';
const filaInt = (r: any) => [
  r.id_intento, r.id_puerta, r.id_empresa, r.tipo, r.id_trabajador, r.similitud,
  r.creado_en_cliente, r.id_dispositivo_origen, r.latitud, r.longitud,
].map(s).join(',');

@Injectable({ providedIn: 'root' })
export class SubidaService {
  private db = inject(DbService);
  private auth = inject(AuthService);
  private log = inject(LogService);
  private subiendo = false;
  private auto = false;

  /** Subida automática GLOBAL (timer 30s + al reconectar), independiente del escáner. Llamar 1 vez en App. */
  iniciarAuto(): void {
    if (this.auto || typeof window === 'undefined') return;
    this.auto = true;
    setInterval(() => this.subirPendientes(), 30000);
    Network.addListener('networkStatusChange', (st) => { if (st.connected) this.subirPendientes(); });
    this.subirPendientes();
  }

  async subirPendientes() {
    if (this.subiendo) return;
    if (!(await Network.getStatus()).connected) return;
    this.subiendo = true;
    try {
      await this.subir('asistencias', HEADER_ASIS, filaAsis);
      await this.subir('intentos',    HEADER_INT,  filaInt);
    } catch { /* red caída → se reintenta en el próximo ciclo */ }
    finally { this.subiendo = false; }
  }

  private async subir(tabla: 'asistencias' | 'intentos',
                      header: string, fila: (r: any) => string) {
    const rows = await this.db.pendientes(tabla, 500);      // < INGESTA_MAX_FILAS (50k)
    if (!rows.length) return;

    const csv = header + '\n' + rows.map(fila).join('\n') + '\n';
    const form = new FormData();
    form.append('archivo', new Blob([csv], { type: 'text/csv' }), `${tabla}.csv`);   // campo DEBE ser 'archivo'

    this.log.net(`↑ POST off_sync/${tabla} (${rows.length} filas)`);
    const resp = await fetch(`${environment.apiUrl}/off_sync/${tabla}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.auth.token}` },   // NO fijar Content-Type: FormData pone el boundary
      body: form,
    });
    if (!resp.ok) { this.log.error(`✕ subida ${tabla}: HTTP ${resp.status}`); throw new Error(`Subida ${tabla} HTTP ${resp.status}`); }

    const res = await resp.json();                          // { recibidos, insertados, duplicados, rechazados:[{linea,id,motivo}] }
    const malasId = new Set<string>((res.rechazados ?? []).map((x: any) => x.id).filter(Boolean));
    const pk = tabla === 'asistencias' ? 'id_asistencia' : 'id_intento';
    const ok: string[] = [], malas: string[] = [];
    rows.forEach(r => (malasId.has(r[pk]) ? malas : ok).push(r[pk]));

    await this.db.marcar(tabla, ok, 1);      // 200 (insertados O duplicados) ⇒ el server ya los tiene
    await this.db.marcar(tabla, malas, 2);   // inválidas ⇒ marcar 2 para no reintentar en bucle
    this.log.ok(`✓ ${tabla}: ${res.insertados ?? '?'} ins, ${res.duplicados ?? '?'} dup, ${malas.length} rech`);
  }
}
