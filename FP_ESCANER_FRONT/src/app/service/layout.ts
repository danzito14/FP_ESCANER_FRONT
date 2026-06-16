import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const KEY = 'sidebar_oculto';

/** Estado de UI del shell (visibilidad del sidebar), persistido en localStorage. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** true = sidebar escondido. */
  readonly sidebarOculto = signal<boolean>(this.read());

  toggle(): void {
    const v = !this.sidebarOculto();
    this.sidebarOculto.set(v);
    if (this.isBrowser) localStorage.setItem(KEY, v ? '1' : '0');
  }

  private read(): boolean {
    return this.isBrowser && localStorage.getItem(KEY) === '1';
  }
}
