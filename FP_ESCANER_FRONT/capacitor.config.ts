import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cloud.slagricola.slasistencias',
  appName: 'SL Asistencias',
  webDir: 'www',
  plugins: {
    // HTTP nativo: parchea fetch/XHR para saltarse el preflight CORS del WebView
    // (origen https://localhost). El back queda intacto.
    CapacitorHttp: {
      enabled: true,
    },
    // BD local cifrada (SQLCipher) para los embeddings biométricos del kiosko offline.
    // Sin esto, DbService.init() truena en isSecretStored()/setEncryptionSecret().
    CapacitorSQLite: {
      androidIsEncryption: true,
    },
  },
};

export default config;
