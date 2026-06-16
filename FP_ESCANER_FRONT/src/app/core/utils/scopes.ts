/**
 * Expande scopes en notación compacta a scopes individuales.
 *   'usuarios:read,write,delete'  → ['usuarios:read','usuarios:write','usuarios:delete']
 *   'trabajadores:read,write, areas:read' → [...,'areas:read']
 * Tokens ya individuales ('*', '*:read', 'scanner:use') quedan igual.
 *
 * Acepta tanto un arreglo ya separado como entradas que contengan comas.
 */
export function expandirScopes(raw: string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const entry of raw ?? []) {
    let recursoActual = '';
    for (const parteRaw of String(entry).split(',')) {
      const parte = parteRaw.trim();
      if (!parte) continue;
      if (parte.includes(':')) {
        const [recurso] = parte.split(':');
        recursoActual = recurso;
        out.add(parte);
      } else if (recursoActual) {
        // Acción suelta tras un 'recurso:accion' previo (ej. el 'write' de 'usuarios:read,write').
        out.add(`${recursoActual}:${parte}`);
      } else {
        out.add(parte);
      }
    }
  }
  return [...out];
}
