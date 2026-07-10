import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service';
import { LogService } from './log.service';

interface Ref { id: number; nombre: string; apellido: string; emb: Float32Array; }

/**
 * L2-normaliza un vector para que el producto punto sea el coseno.
 * Si el vector es cero/NaN lo devuelve tal cual (se descarta luego).
 */
function l2norm(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (!n || !Number.isFinite(n)) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

@Injectable({ providedIn: 'root' })
export class MatchService {
  private db = inject(DbService);
  private log = inject(LogService);
  private base: Ref[] = [];
  private cargado = false;

  /** Rostros cargados en RAM (para diagnóstico). */
  get tamano(): number { return this.base.length; }

  /** Carga todos los embeddings a RAM (Float32Array L2-normalizado) para el match. */
  async cargar(forzar = false) {
    if (this.cargado && !forzar) return;
    const db = await this.db.init();
    const r = await db.query('SELECT id_trabajador,nombre,apellido,embedding FROM trabajadores');
    let malos = 0;
    this.base = (r.values ?? []).flatMap((x: any) => {
      let arr: unknown;
      try { arr = JSON.parse(x.embedding); } catch { malos++; return []; }
      if (!Array.isArray(arr) || arr.length < 512) { malos++; return []; }
      return [{
        id: x.id_trabajador, nombre: x.nombre, apellido: x.apellido,
        emb: l2norm(Float32Array.from(arr as number[])),
      }];
    });
    this.cargado = true;
    this.log.info(`match: ${this.base.length} rostros en RAM${malos ? ` (${malos} embeddings inválidos)` : ''}`);
  }

  /**
   * Devuelve el rostro más parecido y su coseno (0..1). Normaliza el embedding de
   * entrada y tolera longitudes/valores raros (nunca deja que un NaN oculte el match).
   */
  buscar(emb: Float32Array) {
    if (!this.base.length) return null;
    const q = l2norm(emb);
    let mejor = -1, idx = -1;
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i].emb;
      const n = Math.min(q.length, b.length);
      let dot = 0;
      for (let k = 0; k < n; k++) dot += q[k] * b[k];
      if (Number.isFinite(dot) && dot > mejor) { mejor = dot; idx = i; }
    }
    if (idx < 0) return null;
    const t = this.base[idx];
    return { id: t.id, nombre: t.nombre, apellido: t.apellido, sim: mejor };
  }
}
