/** Entorno de desarrollo (por defecto en `ng serve`). */
export const environment = {
  production: false,
  // Igual que prod, el back local va bajo /api (el prefijo faltaba → emp_sync/off_sync daban 404).
  // OJO: 8005 = traefik (API completa). El 8100 es kiosk_local y SOLO sirve /kiosk/* + /health.
  apiUrl: 'http://localhost:8005/api',
  // Kiosko de escritorio: el back local (kiosk_local :8100). Vacío = ruta relativa
  // servida por el proxy de dev (proxy.conf.json) para evitar CORS en `ng serve`.
  kioskLocalUrl: '',
};
