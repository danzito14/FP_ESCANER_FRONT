/**
 * Entorno de la estación de escritorio (Electron). TODO va por rutas RELATIVAS:
 * el proceso de Electron sirve el front y hace de proxy (ver electron/main.cjs), así
 * la app corre en un solo origen y no depende de CORS.
 *   '/api'     → backend de la nube (login, admin, reportes)  — CLOUD_API_URL
 *   '/kiosk'   → backend local kiosk_local :8100 (roster, cola, calibración)
 *   '/scanner' → backend local kiosk_local :8100 (FICHAJE)   — KIOSK_API_URL
 * Con esto la misma app sirve para el usuario kiosko y para un admin.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  kioskLocalUrl: '',
  /**
   * Base del ESCÁNER. En la estación apunta al backend LOCAL: '' → ruta relativa
   * '/scanner/...' que Electron proxya a kiosk_local :8100, el cual corre el MISMO `back`
   * de la nube con MODO_KIOSKO. Rutas y respuestas idénticas a las de la nube, así que el
   * escáner normal ficha CON y SIN internet, sin pantalla aparte. Login/admin/reportes
   * siguen yendo por apiUrl (nube) y sí requieren conexión.
   */
  scannerUrl: '',
};
