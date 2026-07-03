/**
 * Shim de compatibilidad para el kit offline.
 * El kit importa `./auth.service`; el AuthService real de este proyecto vive en
 * `src/app/service/auth.ts` (expone `.token`). Aquí solo lo re-exportamos para que
 * los imports del kit resuelvan sin tener que tocarlos uno por uno.
 */
export { AuthService } from '../service/auth';
