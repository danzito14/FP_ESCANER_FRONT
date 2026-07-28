import { environment } from '../../../environments/environment';

/** URL base del backend FastAPI (según el entorno: dev = localhost, prod = dominio). */
export const API_URL = environment.apiUrl;

/**
 * Base del ESCÁNER (`/scanner/*`). Normalmente es la misma que API_URL, pero en la
 * estación de escritorio apunta al backend LOCAL, que corre el mismo `back` con las
 * mismas rutas → el escáner ficha con y sin internet. Se separa de API_URL porque el
 * resto (login, admin, reportes) sigue yendo a la nube.
 */
export const SCANNER_URL = environment.scannerUrl ?? environment.apiUrl;
