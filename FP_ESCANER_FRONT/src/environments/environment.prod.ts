/** Entorno de producción (web y APK). Back y front comparten dominio (back en /api). */
export const environment = {
  production: true,
  apiUrl: 'https://sl-asistencias.slagricola.cloud/api',
  // Kiosko de escritorio (Electron): el back local corre en la misma PC.
  kioskLocalUrl: 'http://localhost:8100',
};

// npm run build:web
// sudo cp -r www/* /var/www/sl-asistencias/