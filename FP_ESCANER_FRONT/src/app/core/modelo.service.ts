import { Injectable, inject } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { FaceEngine } from './face-engine';
import { LogService } from './log.service';

const MODELO = 'w600k_r50.onnx';
const FINAL  = `models/${MODELO}`;
const PART   = `models/${MODELO}.part`;
const K_VER  = 'modelo_version';
interface Meta { tamano: number; sha256: string; version: string; }

@Injectable({ providedIn: 'root' })
export class ModeloService {
  private auth = inject(AuthService);
  private log = inject(LogService);
  private listo = false;                       // ya se llamó FaceEngine.init esta sesión

  /** Asegura el modelo en disco (lo baja la 1ª vez) y prende FaceEngine.
      onProgreso(0..100) mueve la barra. Devuelve true si quedó listo. */
  async asegurar(onProgreso?: (p: number) => void): Promise<boolean> {
    if (this.listo && await this.existe(FINAL)) return true;   // no re-init

    const meta = await this.fetchMeta();       // null si offline

    // Sin red: usar lo de disco SOLO si parece completo (tiene versión guardada).
    if (!meta) {
      if (!(await this.existe(FINAL)) || !localStorage.getItem(K_VER)) return false;
      onProgreso?.(100);
      return this.prender();                   // sin sha; createSession igual atrapa corrupción gruesa
    }

    // Con meta: ¿el de disco coincide en TAMAÑO y VERSIÓN? (no solo >0)
    if (await this.discoCoincide(meta)) { onProgreso?.(100); return this.prender(meta.sha256); }

    // (Re)descargar a .part → verificar tamaño → rename atómico.
    // downloadFile con recursive NO crea el subdir en Android (ENOENT) → lo creamos a mano.
    try { await Filesystem.mkdir({ path: 'models', directory: Directory.Data, recursive: true }); } catch {}
    await this.borrar(PART);
    this.log.net(`↓ GET off_sync/modelo/${MODELO} (${meta.tamano} bytes, v${meta.version})…`);
    const h = await Filesystem.addListener('progress', e => {
      if (e.contentLength) onProgreso?.(Math.round((e.bytes / e.contentLength) * 100));
    });
    try {
      await Filesystem.downloadFile({
        url: `${environment.apiUrl}/off_sync/modelo/${MODELO}`,
        path: PART, directory: Directory.Data, recursive: true, progress: true,
        headers: { Authorization: `Bearer ${this.auth.token}` },
      });
    } catch (e: any) {
      this.log.error(`✕ descarga modelo: ${e?.message ?? 'falló'}`);
      await this.borrar(PART); return false;
    } finally { await h.remove(); }

    const st = await this.stat(PART);          // verificación anti-truncamiento
    if (!st || st.size !== meta.tamano) {
      this.log.error(`✕ modelo truncado (${st?.size ?? 0}/${meta.tamano})`);
      await this.borrar(PART); return false;
    }

    await this.borrar(FINAL);
    await Filesystem.rename({ from: PART, to: FINAL, directory: Directory.Data });
    localStorage.setItem(K_VER, meta.version);
    this.log.ok(`✓ modelo descargado y verificado (${meta.tamano} bytes)`);
    return this.prender(meta.sha256);
  }

  /** ¿El modelo de reconocimiento ya está en disco? (para la verificación de datos). */
  async modeloEnDisco(): Promise<boolean> {
    return this.existe(FINAL);
  }

  /** Carga el modelo desde disco SIN descargar (para el guard/escáner en cold-start).
      false si aún no está bajado → el llamador debe mandar a /descarga. Idempotente. */
  async cargarDeDisco(): Promise<boolean> {
    if (this.listo && await this.existe(FINAL)) return true;      // ya prendido esta sesión
    if (!(await this.existe(FINAL)) || !localStorage.getItem(K_VER)) return false;
    return this.prender();                                        // FaceEngine.init desde el archivo local
  }

  /** Prende FaceEngine; si init falla (sha/onnx corrupto) BORRA y devuelve false → re-baja al próximo arranque. */
  private async prender(sha256?: string): Promise<boolean> {
    try {
      const abs = (await Filesystem.getUri({ directory: Directory.Data, path: FINAL })).uri;
      await FaceEngine.init({ recognitionPath: abs, ...(sha256 ? { sha256 } : {}) });
      this.listo = true;
      this.log.ok('✓ FaceEngine listo (reconocimiento)');
      return true;
    } catch (e: any) {
      this.log.error(`✕ FaceEngine.init: ${e?.message ?? 'onnx/sha inválido'} → re-baja`);
      await this.borrar(FINAL); localStorage.removeItem(K_VER); this.listo = false;
      return false;
    }
  }

  private async fetchMeta(): Promise<Meta | null> {
    const url = `${environment.apiUrl}/off_sync/modelo/${MODELO}/meta`;
    this.log.net(`→ GET off_sync/modelo/${MODELO}/meta`);
    try {
      const r = await CapacitorHttp.get({
        url, headers: { Authorization: `Bearer ${this.auth.token}` },
      });
      if (r.status === 200) { this.log.ok(`← 200 meta (v${(r.data as Meta)?.version})`); return r.data as Meta; }
      this.log.error(`← ${r.status} meta — ¿el back no está desplegado / sin el modelo?`);
      return null;
    } catch (e: any) {
      this.log.error(`✕ meta: ${e?.message ?? 'sin conexión'}`);
      return null;
    }
  }
  private async discoCoincide(m: Meta) {
    const st = await this.stat(FINAL);
    return !!st && st.size === m.tamano && localStorage.getItem(K_VER) === m.version;
  }
  private async stat(p: string) { try { return await Filesystem.stat({ directory: Directory.Data, path: p }); } catch { return null; } }
  private async existe(p: string) { const s = await this.stat(p); return !!s && s.size > 0; }
  private async borrar(p: string) { try { await Filesystem.deleteFile({ directory: Directory.Data, path: p }); } catch {} }
}
