/** Entorno de desarrollo (por defecto en `ng serve`). */
export const environment = {
  production: false,
  // Igual que prod, el back local va bajo /api (el prefijo faltaba → emp_sync/off_sync daban 404).
  apiUrl: 'http://localhost:8005/api',
};
