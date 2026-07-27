/**
 * Entorno de la estación de escritorio (Electron). TODO va por rutas RELATIVAS:
 * el proceso de Electron sirve el front y hace de proxy (ver electron/main.cjs), así
 * la app corre en un solo origen y no depende de CORS.
 *   '/api'   → backend de la nube (login, admin, reportes) — CLOUD_API_URL
 *   '/kiosk' → backend local kiosk_local :8100 (escáner)   — KIOSK_API_URL
 * Con esto la misma app sirve para el usuario kiosko y para un admin.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  kioskLocalUrl: '',
};
