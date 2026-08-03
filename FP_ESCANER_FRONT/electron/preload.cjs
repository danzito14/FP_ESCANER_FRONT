// Preload del kiosko de escritorio. Expone lo mínimo al front:
//  - `escritorio`: bandera para PlatformService.isElectron (manda al usuario kiosko
//    a /kiosko-pc en vez del flujo offline del APK).
//  - `pantallaCompleta(on)`: fuerza/suelta pantalla completa (el escáner la pide al
//    capturar; ver src/app/service/escritorio.ts). F11 también la alterna.
//  - `leerConfig()/guardarConfig()`: config de ARRANQUE de la estación (ruta inicial y
//    si abre a pantalla completa). Vive en un JSON del proceso principal, no en
//    localStorage, porque hace falta antes de que exista la ventana.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskoPC', {
  escritorio: true,
  pantallaCompleta: (on) => ipcRenderer.invoke('kiosko:pantalla-completa', !!on),
  leerConfig: () => ipcRenderer.invoke('kiosko:leer-config'),
  guardarConfig: (cfg) => ipcRenderer.invoke('kiosko:guardar-config', cfg),
  // Voz neuronal local (piper): devuelve el WAV en un ArrayBuffer, o null si no hay
  // motor/modelos instalados, en cuyo caso el front usa la voz del sistema.
  vozDisponible: () => ipcRenderer.invoke('voz:disponible'),
  vozListar: () => ipcRenderer.invoke('voz:listar'),
  vozHablar: (texto, voz) => ipcRenderer.invoke('voz:hablar', texto, voz),
});
