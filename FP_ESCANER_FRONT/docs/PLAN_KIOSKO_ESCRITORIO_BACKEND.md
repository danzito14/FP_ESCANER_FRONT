# Plan — Kiosko de Escritorio (Electron) con reconocimiento local-first

**Fecha:** 2026-07-11
**Para:** equipo de Backend
**De:** equipo de Front / kiosko
**Estado:** propuesta para revisión

---

## 1. Contexto y objetivo

Hoy el kiosko de fichaje facial corre como **APK (Capacitor)** en tablets. En tablets de gama baja (Galaxy Tab A8, 2.4 GB, marcada por Android como *low memory device*) el sistema **mata la app por falta de memoria** (Low Memory Killer) tras unos minutos con la cámara abierta. Verificado por logcat: no es un crash de código, es OOM del dispositivo.

Como alternativa robusta se propone una **versión de escritorio (PC / mini-PC + webcam)** empaquetada con **Electron/Tauri**, que **se comporte igual que el modo offline del APK**:

1. Login contra la nube y **descarga del roster** de la empresa.
2. **Reconoce localmente primero**; si no hay match, **cae a la nube (prod)**.
3. Guarda fichajes **localmente** y los **sincroniza** a la nube.

La PC no tiene el Low Memory Killer de Android y tiene RAM/CPU de sobra → elimina de raíz el problema de estabilidad.

**Meta de este documento:** definir qué necesita el **backend** para soportar este modo.

---

## 2. Arquitectura propuesta

```
┌─ App de escritorio (Electron/Tauri) ──────────────────────────┐
│                                                               │
│  Front Angular (mismo build www/ que ya se genera)            │
│    • Auth/Admin/Reportes   ─────────────────────►  ☁️  NUBE   │
│    • Escáner / fichaje / sync  ──►  localhost                  │
│                                       │                        │
│  Backend LOCAL (sidecar, empaquetado con la app)              │
│    • BD local (SQLite) con el roster + embeddings de SU empresa│
│    • Reconoce local (mismo motor buffalo_l)                    │
│    • Si NO hay match  ─────────────────────────►  ☁️  NUBE     │
│    • Cola de eventos local  ──(sync)──────────►  ☁️  NUBE     │
└───────────────────────────────────────────────────────────────┘
```

**Decisión clave — la orquestación "local → nube" vive en el BACKEND LOCAL, no en el front.**
En el APK el *front* orquestaba (no había backend local). En escritorio SÍ hay backend local, así que el front apunta el escáner **siempre a `localhost`** y el backend local decide si responde él o reenvía a la nube. Esto mantiene el front casi sin cambios.

---

## 3. Qué (creemos que) YA existe y se REUSA

> ⚠️ **A confirmar por backend** — esto viene del diseño del modo offline del APK; puede estar total o parcialmente hecho.

- **Micro `offline_sync`** que ya sirve al APK: **descarga de roster** (↓) y **subida de eventos** (↑).
- **Endpoint de reconocimiento en la nube** (el que usa hoy el escáner: multi-frame + liveness de servidor). Sería el **fallback**.
- **Auth / login multi-empresa** con scope por empresa (JWT).

Si esto existe, el trabajo nuevo del backend es **menor**: básicamente **habilitar que el motor de reconocimiento corra en local** apuntando a la BD local, + cerrar los pendientes de sincronización.

---

## 4. Lo que necesitamos del backend

### 4.1 Autenticación y contexto de empresa para el nodo local
- El login se hace contra la **nube** → devuelve JWT (ya existe).
- El **backend local** necesita saber **de qué empresa es su roster** y poder firmar la sincronización. Opciones a decidir con backend:
  - (a) Se le pasa el **JWT del usuario** al local, que con él baja el roster y sincroniza; o
  - (b) El kiosko tiene una **credencial de servicio** propia (token de dispositivo/kiosko) con scope de esa empresa.
- **Pregunta:** ¿el reconocimiento y la sincronización pueden hacerse con un **token de dispositivo** de larga vida, o deben ir siempre con la sesión del usuario logueado?

### 4.2 Descarga del roster con embeddings (↓)
Endpoint que entregue, **por empresa** (y filtrable por tipo de fichaje / área como ya se hace):
- `id_trabajador`, `id_emp` (nº nómina), nombre, apellido, área/tipo.
- **El/los embedding(s)** de cada trabajador (vector buffalo_l, float32[512], ya normalizado).
- Un **cursor/versión** para descargas incrementales (solo lo que cambió desde la última sync).

**Preguntas:**
- ¿Existe ya un endpoint que devuelva **embeddings** (no solo datos del trabajador)? ¿Formato del vector (JSON array, base64 de float32, …)?
- ¿Un trabajador puede tener **varios embeddings**? ¿Se manda el promedio o todos?

### 4.3 Reconocimiento local + fallback a nube
El **backend local** expone un endpoint tipo `POST /acceso` (mismo contrato que el actual del escáner) que:
1. Detecta/alinea → extrae embedding → **match coseno contra el roster local** (umbral igual al de prod, hoy `0.5`).
2. Si **match** ≥ umbral → registra evento local y responde.
3. Si **no hay match** (o baja confianza) y **hay internet** → **reenvía las fotos al endpoint de reconocimiento de la nube** (que registra allá) y devuelve esa respuesta.
4. Si **no hay internet** → registra intento local `desconocido`.

**Necesitamos del backend:**
- Confirmar que el **motor de reconocimiento se puede ejecutar como servicio local** (mismo código que prod) apuntando a la **BD local**. Esto garantiza **paridad de embeddings** con la nube (riesgo conocido del modo offline).
- Confirmar el **contrato exacto** del endpoint de reconocimiento de la nube usado como fallback (params, multipart de fotos, respuesta).

### 4.4 Sincronización de eventos (↑)
El backend local acumula fichajes/intentos y los sube en lote. Pendientes ya identificados para el modo offline del APK (aplican igual aquí):
- **Derivar entrada/salida** del lote (2º scan del día = salida) usando `creado_en_cliente` + zona horaria.
- **Reconciliar** con lotes que llegan tarde (orden no garantizado).
- Devolver por cada evento subido el `id_trabajador` / **PK del registro** creado o el **motivo de rechazo**.
- Completar el flujo de **`/candidatos`** (revisión de no-reconocidos), si aplica.

**Pregunta:** ¿el endpoint de subida en lote ya existe y devuelve el resultado por ítem, o hay que definirlo/cerrarlo?

---

## 5. Modelo de datos local (referencia)

BD local en la PC (SQLite; **cifrada**, ideal). Tablas mínimas:

- `roster(id_trabajador, id_emp, nombre, apellido, area, tipo_fichaje, embedding BLOB, actualizado_en)`
- `eventos(id_local, id_trabajador?, tipo, sim, lat, lon, creado_en_cliente, estado_sync, id_remoto?)`
- `meta(clave, valor)` → versión del roster, última sync, empresa, etc.

*(El diseño exacto lo puede definir backend si el nodo local es una instancia de su servicio.)*

---

## 6. Seguridad

- BD local **cifrada** (los embeddings son dato biométrico).
- Token/credencial del kiosko con **scope de una sola empresa**.
- El backend local **solo** escucha en `localhost` (no expuesto en red).
- Reconocimiento/fichaje y sync **firmados** con el token del kiosko/usuario.

---

## 7. Alcance del BACKEND vs alcance del FRONT/Escritorio

| Área | Responsable |
|---|---|
| Empaquetar Electron + arrancar el sidecar | Front/Escritorio |
| Motor de reconocimiento local (servicio) | **Backend** |
| Endpoint roster-con-embeddings (↓) | **Backend** |
| Reconocimiento nube (fallback) — contrato | **Backend** (ya existe, confirmar) |
| Sync de eventos en lote (↑) + pendientes §4.4 | **Backend** |
| Auth / token de dispositivo | **Backend** |
| BD local (esquema + acceso) | A definir (backend si el nodo es su servicio) |
| Lógica local-first → nube | **Backend local** (§2) |

---

## 8. Supuestos a confirmar con backend

1. ¿El **motor de reconocimiento** (buffalo_l + anti-spoof) puede correr como **servicio local** en Windows (empaquetado, p.ej. PyInstaller/Docker) apuntando a una BD local?
2. ¿Existe endpoint que entregue **embeddings por empresa** para descargar el roster? Formato del vector.
3. ¿Existe **subida de eventos en lote** con resultado por ítem? ¿Estado de los pendientes de §4.4?
4. ¿Auth por **token de dispositivo** de larga vida, o siempre sesión de usuario?
5. ¿El micro **`offline_sync`** actual (para el APK) es reutilizable tal cual para el escritorio?

---

## 9. Fases sugeridas

1. **Hito 1 — Escritorio contra la nube:** Electron carga el front y apunta TODO a la nube. Kiosko de PC estable ya, sin OOM. *(No requiere backend nuevo.)*
2. **Hito 2 — Roster local + reconocimiento local:** nodo local + descarga de embeddings + match local.
3. **Hito 3 — Fallback + sync:** no-match → nube; eventos locales → sync (cerrar §4.4).

Con el Hito 1 ya hay algo usable en producción; el offline se agrega por capas.

---

## 10. Referencias en el código (front) — de dónde sale la lógica offline

- Flujo offline del APK (local-first + fallback a servidor): `src/app/pages/escaneo/escaneo.component.ts`
- Match coseno local: `src/app/core/match.service.ts`
- Motor / plugin de reconocimiento (equivalente nativo que en PC reemplaza el servicio local): `src/app/core/face-engine.ts`
- Sincronización de pendientes: servicios `subida` / `eventos` en `src/app/core/`
