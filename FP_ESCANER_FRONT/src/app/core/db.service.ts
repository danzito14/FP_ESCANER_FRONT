import { Injectable } from '@angular/core';
import {
  CapacitorSQLite, SQLiteConnection, SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { RosterResponse } from './roster.model';

const DB_NOMBRE = 'slasistencias';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT);

CREATE TABLE IF NOT EXISTS trabajadores (
  id_trabajador INTEGER PRIMARY KEY,
  id_emp TEXT, origen_nomina TEXT,
  nombre TEXT NOT NULL, apellido TEXT NOT NULL,
  permiso_escaneo TEXT, id_area INTEGER,
  embedding TEXT NOT NULL,          -- JSON de 512 floats
  calidad REAL, modelo_ia TEXT
);
CREATE TABLE IF NOT EXISTS areas (
  id_area INTEGER PRIMARY KEY, nombre_area TEXT,
  tipo_area TEXT, poligono_geojson TEXT
);
CREATE TABLE IF NOT EXISTS puertas (
  id_puerta INTEGER PRIMARY KEY, nombre_puerta TEXT,
  tipo_puerta TEXT, id_area INTEGER
);

CREATE TABLE IF NOT EXISTS asistencias (
  id_asistencia TEXT PRIMARY KEY, id_trabajador INTEGER, id_puerta INTEGER,
  id_empresa INTEGER, tipo_registro TEXT, creado_en_cliente TEXT,
  confianza_biometrica REAL, dentro_de_area INTEGER,
  id_dispositivo_origen INTEGER, latitud REAL, longitud REAL, sincronizado INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS intentos (
  id_intento TEXT PRIMARY KEY, id_puerta INTEGER, id_empresa INTEGER, tipo TEXT,
  id_trabajador INTEGER, similitud REAL, creado_en_cliente TEXT,
  id_dispositivo_origen INTEGER, latitud REAL, longitud REAL, sincronizado INTEGER DEFAULT 0
);
`;

@Injectable({ providedIn: 'root' })
export class DbService {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db?: SQLiteDBConnection;

  /** Idempotente: abre (o reusa) la conexión CIFRADA (SQLCipher) y crea el esquema. */
  async init(): Promise<SQLiteDBConnection> {
    if (this.db) return this.db;

    // Cifrado en reposo (datos biométricos: embeddings de 512 floats). El secret se genera
    // UNA vez y vive en el secure store del device (EncryptedSharedPreferences en Android),
    // NUNCA en el APK. Requiere capacitor.config → plugins.CapacitorSQLite.androidIsEncryption = true.
    if (!(await this.sqlite.isSecretStored()).result) {
      await this.sqlite.setEncryptionSecret(this.nuevoSecret());
    }

    const ret = await this.sqlite.checkConnectionsConsistency();
    const existe = (await this.sqlite.isConnection(DB_NOMBRE, false)).result;
    this.db = ret.result && existe
      ? await this.sqlite.retrieveConnection(DB_NOMBRE, false)
      : await this.sqlite.createConnection(DB_NOMBRE, true, 'secret', 1, false);  // encrypted
    await this.db.open();
    await this.db.execute(ESQUEMA);
    return this.db;
  }

  /** Passphrase aleatoria (256 bits) — solo siembra el secure store del plugin; no se persiste aquí. */
  private nuevoSecret(): string {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  async getMeta(clave: string): Promise<string | null> {
    const db = await this.init();
    const r = await db.query('SELECT valor FROM meta WHERE clave = ?', [clave]);
    return r.values?.[0]?.valor ?? null;
  }
  private async setMeta(db: SQLiteDBConnection, clave: string, valor: string, transaction = true) {
    await db.run('INSERT OR REPLACE INTO meta (clave, valor) VALUES (?, ?)', [clave, valor], transaction);
  }

  async contarTrabajadores(): Promise<number> {
    const db = await this.init();
    const r = await db.query('SELECT COUNT(*) AS n FROM trabajadores');
    return r.values?.[0]?.n ?? 0;
  }

  /** Conteos del roster local + versión (para la verificación de datos). */
  async resumenDatos(): Promise<{ trabajadores: number; areas: number; puertas: number; rosterVersion: string | null; pendientes: number }> {
    const db = await this.init();
    const n = async (sql: string) => (await db.query(sql)).values?.[0]?.n ?? 0;
    return {
      trabajadores: await n('SELECT COUNT(*) AS n FROM trabajadores'),
      areas: await n('SELECT COUNT(*) AS n FROM areas'),
      puertas: await n('SELECT COUNT(*) AS n FROM puertas'),
      rosterVersion: await this.getMeta('roster_version'),
      pendientes: await n('SELECT COUNT(*) AS n FROM asistencias WHERE sincronizado=0') +
                  await n('SELECT COUNT(*) AS n FROM intentos WHERE sincronizado=0'),
    };
  }

  async getAreas(): Promise<any[]> {
    const db = await this.init();
    const r = await db.query('SELECT id_area,nombre_area,tipo_area,poligono_geojson FROM areas ORDER BY nombre_area');
    return r.values ?? [];
  }

  /** Polígono del área a la que pertenece la puerta del device (la MISMA contra la que el back re-audita). */
  async getPoligonoDePuerta(idPuerta: number): Promise<string | null> {
    const db = await this.init();
    const r = await db.query(
      `SELECT a.poligono_geojson AS p
         FROM puertas pu JOIN areas a ON a.id_area = pu.id_area
        WHERE pu.id_puerta = ?`, [idPuerta]);
    return r.values?.[0]?.p ?? null;
  }

  /** Nombre de la puerta (para mostrarlo en el escáner). */
  async getPuertaNombre(idPuerta: number): Promise<string | null> {
    const db = await this.init();
    const r = await db.query('SELECT nombre_puerta AS n FROM puertas WHERE id_puerta = ?', [idPuerta]);
    return r.values?.[0]?.n ?? null;
  }

  /** Reemplaza el roster completo. onProgreso (0..100) mueve la barra durante el guardado. */
  async guardarRoster(r: RosterResponse, onProgreso?: (pct: number) => void): Promise<void> {
    const db = await this.init();
    // Todo el reemplazo va en UNA transacción (internos con transaction=false para no anidar):
    // si truena a media escritura, rollback deja el roster viejo intacto.
    // Antes el DELETE iba fuera de transacción → un corte dejaba el kiosko sin datos.
    await db.beginTransaction();
    try {
      await db.execute('DELETE FROM trabajadores; DELETE FROM areas; DELETE FROM puertas;', false);

      for (const a of r.areas) {
        await db.run(
          'INSERT OR REPLACE INTO areas (id_area,nombre_area,tipo_area,poligono_geojson) VALUES (?,?,?,?)',
          [a.id_area, a.nombre_area, a.tipo_area, a.poligono_geojson], false);
      }
      for (const p of r.puertas) {
        await db.run(
          'INSERT OR REPLACE INTO puertas (id_puerta,nombre_puerta,tipo_puerta,id_area) VALUES (?,?,?,?)',
          [p.id_puerta, p.nombre_puerta, p.tipo_puerta, p.id_area], false);
      }

      const total = r.trabajadores.length, LOTE = 50;
      for (let i = 0; i < total; i += LOTE) {
        const set = r.trabajadores.slice(i, i + LOTE).map(t => ({
          statement: `INSERT OR REPLACE INTO trabajadores
            (id_trabajador,id_emp,origen_nomina,nombre,apellido,permiso_escaneo,id_area,embedding,calidad,modelo_ia)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
          values: [t.id_trabajador, t.id_emp, t.origen_nomina, t.nombre, t.apellido,
                   t.permiso_escaneo, t.id_area, JSON.stringify(t.embedding), t.calidad, t.modelo_ia],
        }));
        await db.executeSet(set, false);
        onProgreso?.(total ? Math.round(((i + set.length) / total) * 100) : 100);
      }

      await this.setMeta(db, 'roster_version', r.roster_version, false);
      await this.setMeta(db, 'roster_tipo', r.tipo, false);
      await this.setMeta(db, 'roster_empresa', String(r.empresa), false);

      await db.commitTransaction();
    } catch (e) {
      try { await db.rollbackTransaction(); } catch {}
      throw e;                                   // el llamador (SyncService) ya cae al fallback
    }
  }

  /** Refleja un rostro asignado en el roster local para reconocer offline SIN re-descargar. */
  async upsertTrabajadorLocal(t: any) {
    const db = await this.init();
    await db.run(`INSERT OR REPLACE INTO trabajadores
      (id_trabajador,id_emp,origen_nomina,nombre,apellido,permiso_escaneo,id_area,embedding,calidad,modelo_ia)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [t.id_trabajador, t.id_emp, t.origen_nomina, t.nombre, t.apellido, t.permiso_escaneo,
       t.id_area, JSON.stringify(t.embedding), t.calidad, t.modelo_ia]);
  }

  // ── Eventos capturados offline ─────────────────────────────────────────────
  async insertarAsistencia(a: any) {
    const db = await this.init();
    await db.run(`INSERT OR IGNORE INTO asistencias
      (id_asistencia,id_trabajador,id_puerta,id_empresa,tipo_registro,creado_en_cliente,
       confianza_biometrica,dentro_de_area,id_dispositivo_origen,latitud,longitud,sincronizado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
      [a.id_asistencia, a.id_trabajador, a.id_puerta, a.id_empresa, a.tipo_registro,
       a.creado_en_cliente, a.confianza_biometrica,
       a.dentro_de_area === null ? null : (a.dentro_de_area ? 1 : 0),
       a.id_dispositivo_origen, a.latitud, a.longitud]);
  }

  async insertarIntento(i: any) {
    const db = await this.init();
    await db.run(`INSERT OR IGNORE INTO intentos
      (id_intento,id_puerta,id_empresa,tipo,id_trabajador,similitud,creado_en_cliente,
       id_dispositivo_origen,latitud,longitud,sincronizado)
       VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
      [i.id_intento, i.id_puerta, i.id_empresa, i.tipo, i.id_trabajador, i.similitud,
       i.creado_en_cliente, i.id_dispositivo_origen, i.latitud, i.longitud]);
  }

  private pk(t: 'asistencias' | 'intentos') { return t === 'asistencias' ? 'id_asistencia' : 'id_intento'; }

  async pendientes(tabla: 'asistencias' | 'intentos', limite = 500): Promise<any[]> {
    const db = await this.init();
    const r = await db.query(
      `SELECT * FROM ${tabla} WHERE sincronizado = 0 ORDER BY creado_en_cliente LIMIT ?`, [limite]);
    return r.values ?? [];
  }

  async marcar(tabla: 'asistencias' | 'intentos', ids: string[], estado = 1) {
    if (!ids.length) return;
    const db = await this.init();
    const ph = ids.map(() => '?').join(',');
    await db.run(`UPDATE ${tabla} SET sincronizado = ? WHERE ${this.pk(tabla)} IN (${ph})`, [estado, ...ids]);
  }
}
