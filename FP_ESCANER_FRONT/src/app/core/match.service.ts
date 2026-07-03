import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service';

interface Ref { id: number; nombre: string; apellido: string; emb: Float32Array; }

@Injectable({ providedIn: 'root' })
export class MatchService {
  private db = inject(DbService);
  private base: Ref[] = [];
  private cargado = false;

  /** Carga todos los embeddings a RAM (Float32Array) para el match por fuerza bruta. */
  async cargar(forzar = false) {
    if (this.cargado && !forzar) return;
    const db = await this.db.init();
    const r = await db.query('SELECT id_trabajador,nombre,apellido,embedding FROM trabajadores');
    this.base = (r.values ?? []).map((x: any) => ({
      id: x.id_trabajador, nombre: x.nombre, apellido: x.apellido,
      emb: Float32Array.from(JSON.parse(x.embedding)),
    }));
    this.cargado = true;
  }

  /** Ambos vectores están L2-normalizados ⇒ coseno = producto punto. */
  buscar(emb: Float32Array) {
    let mejor = -1, idx = -1;
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i].emb; let dot = 0;
      for (let k = 0; k < 512; k++) dot += emb[k] * b[k];
      if (dot > mejor) { mejor = dot; idx = i; }
    }
    if (idx < 0) return null;
    const t = this.base[idx];
    return { id: t.id, nombre: t.nombre, apellido: t.apellido, sim: mejor };
  }
}
