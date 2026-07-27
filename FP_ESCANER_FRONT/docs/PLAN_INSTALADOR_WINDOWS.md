# Plan — Instalador .exe de la Estación de Asistencias (Windows)

**Fecha:** 2026-07-24
**Estado:** propuesta / pendiente de decisiones (ver §7)

## 1. Objetivo

Un `.exe` que deja una PC lista como estación de asistencias **sin que el usuario toque
Docker ni la terminal**: verifica requisitos, deja elegir módulos, baja las imágenes del
registry, las levanta, instala el front de escritorio y configura el arranque automático.

No compila nada en el equipo del cliente: solo `docker compose pull` + `up -d`.

## 2. Estado actual (lo que ya existe)

| Pieza | Estado |
|---|---|
| `kiosk_local` (FastAPI :8100, pgvector, motor buffalo_l) | ✅ hecho y probado e2e |
| Front Electron con escáner local-first (`/kiosko-pc`) | ✅ hecho |
| Front Electron con panel de admin completo | ✅ hecho (proxy `/api` → nube en `electron/main.cjs`) |
| Pantalla completa solo al escanear | ✅ hecho |
| Empaquetado `.exe` + asistente de preparación | ⬜ pendiente (este documento) |

El front ya corre **todo en un solo origen** (`http://127.0.0.1:4380`): el proceso de
Electron sirve la SPA y hace de proxy — `/api` → nube, `/kiosk` → `localhost:8100`. Eso
elimina CORS y permite que la misma app sirva para el usuario kiosko y para un admin.

## 3. Qué instala

1. **Requisito único: Docker Desktop.** El instalador lo detecta (`docker version`); si
   falta, ofrece el enlace/instalador y reintenta. No se intenta instalar Docker en
   silencio: requiere WSL2 y reinicio, y su licencia comercial depende del tamaño de la
   empresa (ver §8).
2. **Perfiles de módulos** (compose profiles):
   - **BÁSICA** — reconocimiento local + subida a la nube: `kiosk_postgres`,
     `kiosk_recognition`, `kiosk_local`.
   - **PERSONALIZADA** — agrega lo que se marque: cámaras/monitoreo
     (`sl_employee_monitoring`), media (`sl_media`), etc.
3. **Imágenes** desde el registry (`docker compose --profile X pull`), con login previo
   si el registry es privado.
4. **Front Electron** en `C:\Program Files\SL Asistencias\`.
5. **Arranque automático**: Docker Desktop al inicio de sesión + la app en el `Run` del
   usuario (`app.setLoginItemSettings`), esperando a que el engine responda antes de
   levantar el stack.

## 4. Arquitectura propuesta

```
SLAsistenciasSetup.exe   (electron-builder, target NSIS)
 ├─ App Electron (front + proxy + asistente)
 ├─ installer/compose/docker-compose.yml   ← perfiles básica/personalizada
 ├─ installer/compose/.env.example
 └─ NSIS: accesos directos + %ProgramData%\SLAsistencias\ (config y logs)

Primer arranque → Asistente de preparación (dentro de la propia app Electron):
   1. Requisitos     → docker version / docker compose version
   2. Módulos        → BÁSICA | PERSONALIZADA (checkboxes)
   3. Conexión       → URL de la nube + credenciales de la estación
   4. Descarga       → compose pull (progreso en vivo, log a archivo)
   5. Arranque       → compose up -d + espera a /health de :8100
   6. Autostart      → registra app + Docker al inicio
   → marca `preparado: true` en la config y no vuelve a mostrarse
```

El asistente vive en la app (no en el NSIS) porque necesita mostrar progreso largo,
reintentar y volver a abrirse desde *Configuración → Mantenimiento*. El NSIS solo copia
archivos y crea accesos directos.

## 5. Cambios en el front (checklist)

- [ ] `electron-builder` + target `nsis` (`npm run dist:win`), icono y firma.
- [ ] `installer/compose/` con el compose de perfiles y `.env.example`.
- [ ] IPC nuevo (`preload.cjs`): `docker.estado()`, `stack.instalar(perfil)`,
      `stack.arrancar()`, `stack.estado()`, `autostart.set(on)` — todo `execFile` de
      `docker`, nunca `shell: true`, y con el log en streaming a la UI.
- [ ] Página `/preparacion` (guard: si no está `preparado`, redirige ahí antes que nada).
- [ ] `Configuración → Mantenimiento`: reintentar stack, ver logs, actualizar imágenes.
- [ ] Guardar la config en `%ProgramData%\SLAsistencias\config.json` (no en localStorage:
      debe sobrevivir al perfil de usuario y ser legible por el asistente).

## 6. Trabajo del lado backend

- [ ] Publicar `sl-kiosk-local` y `sl-recognition` en un registry accesible (¿público o
      privado con credenciales de solo lectura?).
- [ ] Un `docker-compose.yml` "de estación" versionado y con tags fijos (no `latest`).
- [ ] `POST /kiosk/acceso` responde **500** si `id_puerta` no existe en el padrón local
      (`ForeignKeyViolation` en `escaneos_id_puerta_fkey`) — y lo hace *después* de haber
      reconocido bien la cara. Debería validar la puerta y responder 400/422 con mensaje,
      o caer a su puerta por defecto. Mitigado en el front, pero el 500 sigue ahí.
- [ ] Credenciales de estación: cómo se autentica `kiosk_local` contra la nube sin meter
      un usuario/contraseña de admin en el equipo.

## 7. Decisiones pendientes

1. **Registry**: ¿cuál y con qué credenciales? Determina si el instalador hace
   `docker login` y dónde guarda ese secreto.
2. **Módulos de PERSONALIZADA**: ¿qué servicios exactos se ofrecen y cuáles son
   incompatibles entre sí?
3. **Docker Desktop vs alternativa**: ver §8.
4. **Firma del `.exe`**: sin certificado, SmartScreen mostrará advertencia en cada
   instalación.

## 8. Riesgos

- **Licencia de Docker Desktop**: es de pago para empresas grandes (>250 empleados o
  >10 M USD de ingresos). Si aplica, la alternativa es un runtime sin esa restricción
  (Podman/containerd) o empaquetar `kiosk_local` como servicio nativo de Windows.
- **WSL2**: exige virtualización activa en BIOS y reinicio; es el punto de fallo más
  probable en PCs de campo. El asistente debe detectarlo y dar el mensaje exacto.
- **Primer `pull`**: son GB (motor de reconocimiento incluido). Hay que permitir
  reanudar y avisar del tamaño antes de empezar.
- **Actualizaciones**: definir si la app se autoactualiza (electron-updater) y si eso
  arrastra tags nuevos de las imágenes.
