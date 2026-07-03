import { Injectable, inject } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { environment } from '../../environments/environment';
import { DbService } from './db.service';
import { AuthService } from './auth.service';
import { MatchService } from './match.service';
import { uuidv7 } from './uuid.util';
import { LogService } from './log.service';

@Injectable({ providedIn: 'root' })
export class EnrolamientoService {
  private db = inject(DbService);
  private auth = inject(AuthService);
  private match = inject(MatchService);
  private log = inject(LogService);

  private authH() { return { Authorization: `Bearer ${this.auth.token}` }; }
  private async empresa() { return Number(await this.db.getMeta('roster_empresa')); }
  private async exigirOnline() {
    if (!(await Network.getStatus()).connected) throw new Error('El enrolamiento necesita conexión.');
  }

  /** Trabajadores activos SIN rostro (para asignarles cara). */
  async candidatos(tipo?: string, nombre?: string) {
    await this.exigirOnline();
    const params: any = {};
    if (tipo) params.tipo = tipo;
    if (nombre) params.nombre = nombre;
    this.log.net('→ GET off_sync/candidatos');
    const res = await CapacitorHttp.get({
      url: `${environment.apiUrl}/off_sync/candidatos`, params, headers: this.authH() });
    if (res.status !== 200) { this.log.error(`✕ candidatos HTTP ${res.status}`); throw new Error(`Candidatos HTTP ${res.status}`); }
    const lista = (res.data.candidatos ?? []) as any[];
    this.log.ok(`← 200 candidatos (${lista.length})`);
    return lista;
  }

  /** MODO ASIGNAR: pone rostro a un candidato existente. */
  async asignar(cand: any, embedding: number[], calidad: number) {
    await this.exigirOnline();
    const res = await this.enviar([{
      embedding, id_empresa: await this.empresa(),
      id_trabajador: cand.id_trabajador, calidad, modelo_ia: 'buffalo_l' }]);
    if (res.asignados > 0) {
      await this.db.upsertTrabajadorLocal({
        id_trabajador: cand.id_trabajador, id_emp: cand.id_emp ?? null,
        origen_nomina: cand.origen_nomina ?? null, nombre: cand.nombre, apellido: cand.apellido,
        permiso_escaneo: cand.permiso_escaneo, id_area: cand.id_area,
        embedding, calidad, modelo_ia: 'buffalo_l' });
      await this.match.cargar(true);           // reconocer offline de inmediato
    }
    return res;
  }

  /** MODO WALK-IN: alta de alguien que NO está en la nómina. */
  async walkin(datos: { nombre: string; apellido: string; id_area: number; permiso_escaneo?: string },
               embedding: number[], calidad: number) {
    await this.exigirOnline();
    const id_local = uuidv7();
    const res = await this.enviar([{
      embedding, id_empresa: await this.empresa(), id_local,
      nombre: datos.nombre, apellido: datos.apellido, id_area: datos.id_area,
      permiso_escaneo: datos.permiso_escaneo ?? 'campo', calidad, modelo_ia: 'buffalo_l' }]);
    // El server devuelve el id_trabajador por id_local → reconocer offline SIN re-descargar el roster.
    const e = (res.enrolados ?? []).find((x: any) => x.id_local === id_local);
    if (e) {
      await this.db.upsertTrabajadorLocal({
        id_trabajador: e.id_trabajador, id_emp: id_local, origen_nomina: 'apk',
        nombre: datos.nombre, apellido: datos.apellido,
        permiso_escaneo: datos.permiso_escaneo ?? 'campo', id_area: datos.id_area,
        embedding, calidad, modelo_ia: 'buffalo_l' });
      await this.match.cargar(true);
    }
    return res;
  }

  private async enviar(items: any[]) {
    this.log.net(`↑ POST off_sync/enrolamientos (${items.length})`);
    const res = await CapacitorHttp.post({
      url: `${environment.apiUrl}/off_sync/enrolamientos`,
      headers: { ...this.authH(), 'Content-Type': 'application/json' },
      data: { items } });
    if (res.status !== 200) { this.log.error(`✕ enrolamiento HTTP ${res.status}`); throw new Error(`Enrolamiento HTTP ${res.status}`); }
    this.log.ok('← 200 enrolamiento');
    return res.data as { creados: number; actualizados: number; asignados: number;
                         enrolados: any[]; rechazados: any[] };
  }
}
