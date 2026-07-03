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
  readonly entradas = signal<LogEntry[]>([]);

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
