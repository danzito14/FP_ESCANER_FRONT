// sync-version.mjs — Genera src/app/core/constants/version.ts desde package.json.
//
// Antes había DOS sitios con la versión y nada que los atara: el package.json (que da
// nombre al .deb y al -setup.exe) y la constante del footer, escrita a mano. Se
// desincronizaron: el 0.2.7 se publicó mostrando "0.2.6.0" en pantalla, así que el
// número que ve el usuario no servía para saber qué build tenía la estación.
//
// El 4º dígito es el BUILD, como documentaba el archivo original: se AUTOINCREMENTA
// cuando se reconstruye la misma versión (0.2.8.0 → 0.2.8.1) y vuelve a 0 en cuanto
// cambia la versión del package.json. Así cada reconstrucción es distinguible sin que
// nadie tenga que acordarse de subir nada.
//
// API_VERSION se conserva tal cual: es informativa y la mantienen a mano.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'src', 'app', 'core', 'constants', 'version.ts');

const { version } = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));

let anterior = '';
let apiVersion = '0.2.0';
try {
  anterior = readFileSync(destino, 'utf8');
  apiVersion = anterior.match(/API_VERSION = '([^']+)'/)?.[1] ?? apiVersion;
} catch {
  // Primera generación: se crea con los valores por defecto.
}

// Build: +1 si seguimos en la misma versión; 0 si la versión cambió.
const appAnterior = anterior.match(/APP_VERSION = '([^']+)'/)?.[1] ?? '';
const mismaVersion = appAnterior.startsWith(`${version}.`);
const build = mismaVersion ? Number(appAnterior.split('.')[3] ?? 0) + 1 : 0;
const appVersion = `${version}.${build}`;

writeFileSync(
  destino,
  `/**
 * Versión del front (se muestra en el footer). GENERADO por scripts/sync-version.mjs
 * a partir de package.json en cada build: NO lo edites a mano, se sobrescribe.
 * Para cambiar la versión usa \`npm version <x.y.z>\`. El 4º número es el BUILD y
 * se autoincrementa al reconstruir la misma versión.
 */
export const APP_VERSION = '${appVersion}';

/** Versión del backend (informativa, se actualiza a mano). */
export const API_VERSION = '${apiVersion}';
`,
  'utf8',
);

console.log(`version.ts → APP_VERSION=${appVersion} (API_VERSION=${apiVersion})`);
