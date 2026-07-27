// Prepara `electron/renderer/` (SPA puro) a partir del build estático, igual que
// sync-mobile pero para el empaque de escritorio. Usa el shell de cliente
// (index.csr.html) como index.html para arrancar sin SSR.
import { cpSync, rmSync, existsSync, copyFileSync } from 'node:fs';

const src = 'dist/FP_ESCANER_FRONT/browser';
const dest = 'electron/renderer';

if (!existsSync(src)) {
  console.error(`No existe ${src}. Corre primero: ng build --configuration electron`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

const csr = `${dest}/index.csr.html`;
if (existsSync(csr)) copyFileSync(csr, `${dest}/index.html`);

console.log('electron/renderer/ listo.');
