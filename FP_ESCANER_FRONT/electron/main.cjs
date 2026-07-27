// Proceso principal de la estación de asistencias de ESCRITORIO (Electron).
// - Sirve el front estático (electron/renderer) en un http local.
// - Hace de PROXY para que TODO salga del MISMO ORIGEN (sin CORS, igual que el
//   proxy de `ng serve`):
//     /kiosk, /health → backend local (kiosk_local :8100)  → escáner local-first
//     /api            → backend de la nube                  → login, admin, reportes
//   Gracias a esto la app sirve igual para el usuario kiosko y para un admin.
// - Abre una ventana normal; el escáner pide pantalla completa solo al capturar.
// Dev:  ng serve (4200) en otra terminal + `npm run electron:dev` (carga 4200).
// Prod: `npm run build:electron` + `npm run electron:start`.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');

const DEV = process.argv.includes('--dev');
const KIOSK_API = process.env.KIOSK_API_URL || 'http://localhost:8100';
const CLOUD_API = process.env.CLOUD_API_URL || 'https://sl-asistencias.slagricola.cloud';
const RENDERER_DIR = path.join(__dirname, 'renderer');
const PORT = 4380;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.map': 'application/json',
};

/**
 * Reenvía la petición a `base` conservando ruta, método, cabeceras y cuerpo
 * (multipart incluido, va en streaming). Quita Origin/Referer: la app no es un
 * sitio web, y así el backend no la ve como una petición cross-origin.
 */
function proxy(req, res, base, errorMsg) {
  const target = new URL(req.url, base);
  const cliente = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers.origin;
  delete headers.referer;

  const up = cliente.request(target, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => {
    console.error(`[proxy] ${req.method} ${req.url} → ${base}: ${e.message}`);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(errorMsg);
  });
  req.pipe(up);
}

/** Sirve un archivo del renderer; si no existe, cae a index.html (SPA). */
function servirEstatico(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const filePath = path.join(RENDERER_DIR, urlPath);
  if (!filePath.startsWith(RENDERER_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(path.join(RENDERER_DIR, 'index.html')).pipe(res);
    }
  });
}

function iniciarServidor() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/kiosk') || req.url.startsWith('/health')) {
        return proxy(req, res, KIOSK_API, 'kiosk_local no disponible');
      }
      if (req.url.startsWith('/api')) {
        return proxy(req, res, CLOUD_API, 'Sin conexión con el servidor');
      }
      servirEstatico(req, res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(`http://127.0.0.1:${PORT}`));
  });
}

/**
 * Pantalla completa a demanda: la ventana arranca normal (login, configuración,
 * padrón) y el front la pone en pantalla completa solo mientras el escáner captura.
 * En prod usa modo kiosko (bloquea atajos del SO); en dev basta fullscreen para
 * poder salir con Esc.
 */
function aplicarPantallaCompleta(win, activar) {
  if (!win || win.isDestroyed()) return;
  if (DEV) {
    win.setFullScreen(activar);
  } else {
    win.setKiosk(activar);
    win.setFullScreen(activar);
  }
}

async function crearVentana() {
  const startUrl = DEV ? 'http://localhost:4200' : await iniciarServidor();
  const win = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#101418',
    // Mismo icono que usará el instalador (build/icon.ico); si falta, Electron pone el suyo.
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  await win.loadURL(startUrl);
  win.maximize(); // ventana grande pero con barra de título: aún no es pantalla completa
  win.show();
}

app.whenReady().then(() => {
  // El front pide/suelta la pantalla completa al iniciar/detener el escáner.
  ipcMain.handle('kiosko:pantalla-completa', (e, activar) => {
    aplicarPantallaCompleta(BrowserWindow.fromWebContents(e.sender), activar);
  });

  // Kiosko: concede cámara (y pantalla completa) sin diálogos.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media' || permission === 'fullscreen');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'fullscreen';
  });

  crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
