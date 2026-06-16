import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { config as faConfig } from '@fortawesome/fontawesome-svg-core';
import { App } from './app/app';
import { config } from './app/app.config.server';

// El CSS base de FontAwesome se sirve vía angular.json (no auto-insertar en SSR).
faConfig.autoAddCss = false;

const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(App, config, context);

export default bootstrap;
