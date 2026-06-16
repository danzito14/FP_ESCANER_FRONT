import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';

import { AuthService } from '../../service/auth';

/**
 * Directiva estructural: muestra el contenido solo si el usuario tiene el scope.
 *   <button *appPuede="'usuarios:write'">Nuevo</button>
 *   <button *appPuede="'usuarios:delete'">Eliminar</button>
 * Reacciona a cambios de scopes (al cargar el rol).
 */
@Directive({ selector: '[appPuede]' })
export class PuedeDirective {
  private readonly tpl = inject(TemplateRef);
  private readonly vcr = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  readonly scope = input.required<string>({ alias: 'appPuede' });

  private mostrado = false;

  constructor() {
    effect(() => {
      const ok = this.auth.tieneScope(this.scope());
      if (ok && !this.mostrado) {
        this.vcr.createEmbeddedView(this.tpl);
        this.mostrado = true;
      } else if (!ok && this.mostrado) {
        this.vcr.clear();
        this.mostrado = false;
      }
    });
  }
}
