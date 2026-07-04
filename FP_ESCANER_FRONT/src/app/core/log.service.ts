import { Injectable, signal } from '@angular/core';

export type LogLevel = 'info' | 'net' | 'ok' | 'warn' | 'error';
export interface LogEntry {
  hora: string;
  level: LogLevel;
  msg: string;
}

/**
 * Log en vivo en pantalla (panel DebugLog) + consola. Buffer acotado en un signal.
 * Sirve para diagnosticar en el APK sin chrome://inspect: rutas, HTTP (url+status), eventos.
 */
@Injectable({ providedIn: 'root' })
export class LogService {
  private readonly MAX = 120;
  private readonly ACTIVO_KEY = 'debug_logs_on';
  readonly entradas = signal<LogEntry[]>([]);

  /**
   * ¿Mostrar el panel de log en pantalla? Lo decide el admin (persistido en
   * localStorage). El buffer SIEMPRE se llena; esto solo controla la visibilidad
   * del panel, para depurar a demanda tanto en APK como en web. Default: apagado.
   */
  readonly activo = signal(this.leerActivo());

  /** Enciende/apaga el panel de log y lo persiste. */
  setActivo(v: boolean): void {
    this.activo.set(v);
    try {
      localStorage.setItem(this.ACTIVO_KEY, v ? '1' : '0');
    } catch {
      /* SSR/sin storage: ignorar */
    }
  }

  private leerActivo(): boolean {
    try {
      return localStorage.getItem(this.ACTIVO_KEY) === '1';
    } catch {
      return false;
    }
  }

  add(level: LogLevel, msg: string): void {
    const d = new Date();
    const hora =
      `${String(d.getHours()).padStart(2, '0')}:` +
      `${String(d.getMinutes()).padStart(2, '0')}:` +
      `${String(d.getSeconds()).padStart(2, '0')}`;
    this.entradas.update((l) => {
      const next = [...l, { hora, level, msg }];
      return next.length > this.MAX ? next.slice(next.length - this.MAX) : next;
    });
    // Espejo a consola (por si hay depuración remota).
    const c = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    c(`[${hora}] ${msg}`);
  }

  info(m: string): void { this.add('info', m); }
  net(m: string): void { this.add('net', m); }
  ok(m: string): void { this.add('ok', m); }
  warn(m: string): void { this.add('warn', m); }
  error(m: string): void { this.add('error', m); }
  clear(): void { this.entradas.set([]); }
}
