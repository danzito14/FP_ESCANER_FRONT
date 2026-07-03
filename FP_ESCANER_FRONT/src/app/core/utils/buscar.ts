import { Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, debounceTime, distinctUntilChanged, skip } from 'rxjs';

/**
 * ¿El término de búsqueda es solo dígitos? Los ids de todos los catálogos son
 * numéricos, así que las páginas enrutan a la búsqueda por id (`/recurso/buscar`)
 * cuando el usuario escribe únicamente números, y a la búsqueda por nombre si no.
 */
export function esNumerico(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && /^\d+$/.test(t);
}

/**
 * Ejecuta `fn` cuando el texto de búsqueda cambia, con debounce.
 * Ignora el valor inicial (usa skip(1)); haz la primera carga aparte.
 * Llamar dentro del constructor (contexto de inyección).
 */
export function alBuscar(texto: Signal<string>, fn: () => void): void {
  toObservable(texto)
    .pipe(debounceTime(300), distinctUntilChanged(), skip(1))
    .subscribe(fn);
}

/**
 * Ejecuta `fn` cuando cambia cualquiera de las señales (texto, fechas, etc.),
 * con debounce. Ignora la emisión inicial combinada (skip(1)); la primera
 * carga se hace aparte. Llamar dentro del constructor (contexto de inyección).
 */
export function alFiltrar(signals: Signal<unknown>[], fn: () => void): void {
  combineLatest(signals.map((s) => toObservable(s)))
    .pipe(debounceTime(300), skip(1))
    .subscribe(fn);
}
