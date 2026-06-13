import { Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, skip } from 'rxjs';

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
