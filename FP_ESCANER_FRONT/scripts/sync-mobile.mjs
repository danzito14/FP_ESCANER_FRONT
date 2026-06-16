// Prepara la carpeta `www/` (SPA puro) para servir en web estática y para que
// Capacitor la empaquete en el APK. Toma el build de navegador y usa el shell de
// cliente (index.csr.html) como index.html, para arrancar en el cliente (sin SSR).
import { cpSync, rmSync, existsSync, copyFileSync } from 'node:fs';

const src = 'dist/FP_ESCANER_FRONT/browser';
const dest = 'www';

if (!existsSync(src)) {
  console.error(`No existe ${src}. Corre primero el build (npm run build).`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

// El SSR deja index.html prerenderizado de la home; para el APK queremos el
// shell de cliente puro.
const csr = `${dest}/index.csr.html`;
if (existsSync(csr)) copyFileSync(csr, `${dest}/index.html`);

console.log('www/ listo para Capacitor.');
