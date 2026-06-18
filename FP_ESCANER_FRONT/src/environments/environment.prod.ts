/** Entorno de producción (web y APK). Back y front comparten dominio (back en /api). */
export const environment = {
  production: true,
  apiUrl: 'https://sl-asistencias.slagricola.cloud/api',
};

// npm run build:web
// sudo cp -r www/* /var/www/sl-asistencias/