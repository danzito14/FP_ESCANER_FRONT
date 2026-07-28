/** Entorno de producción (web y APK). Back y front comparten dominio (back en /api). */
export const environment = {
  production: true,
  apiUrl: 'https://sl-asistencias.slagricola.cloud/api',
  // Kiosko de escritorio (Electron): el back local corre en la misma PC.
  kioskLocalUrl: 'http://localhost:8100',
  // Web y APK escanean contra la NUBE: aquí no hay backend local en la misma máquina.
  // En la estación de escritorio este archivo se sustituye por environment.electron.ts,
  // que manda el escáner al back local (ver angular.json → fileReplacements).
  scannerUrl: 'https://sl-asistencias.slagricola.cloud/api',
};

// npm run build:web
// sudo cp -r www/* /var/www/sl-asistencias/