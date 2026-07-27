// Preload del kiosko de escritorio. Expone lo mínimo al front:
//  - `escritorio`: bandera para PlatformService.isElectron (manda al usuario kiosko
//    a /kiosko-pc en vez del flujo offline del APK).
//  - `pantallaCompleta(on)`: la ventana arranca normal y solo se va a pantalla
//    completa mientras el escáner está capturando (ver src/app/service/escritorio.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskoPC', {
  escritorio: true,
  pantallaCompleta: (on) => ipcRenderer.invoke('kiosko:pantalla-completa', !!on),
});
