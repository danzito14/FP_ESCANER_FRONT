import { environment } from '../../../environments/environment';

/** URL base del backend FastAPI (según el entorno: dev = localhost, prod = dominio). */
export const API_URL = environment.apiUrl;
