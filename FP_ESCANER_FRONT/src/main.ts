import { bootstrapApplication } from '@angular/platform-browser';
import { config } from '@fortawesome/fontawesome-svg-core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// El CSS base de FontAwesome se carga vía angular.json; evitamos la doble
// inserción automática (que además causa mismatch de hidratación en SSR).
config.autoAddCss = false;

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
