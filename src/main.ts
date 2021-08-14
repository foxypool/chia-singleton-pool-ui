import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import * as Sentry from '@sentry/angular';
import { Integrations } from '@sentry/tracing';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { gitCommitHash } from './environments/config';

Sentry.init({
  dsn: 'https://f1ed3ebc92ba45d99ebc558a547e362d@o236153.ingest.sentry.io/5906348',
  release: gitCommitHash || null,
  integrations: [
    new Integrations.BrowserTracing({
      tracingOrigins: ['localhost', 'https://api2.foxypool.io/api'],
      routingInstrumentation: Sentry.routingInstrumentation,
    }),
  ],
  tracesSampleRate: 0,
  allowUrls: ['foxypool.io'],
  ignoreErrors: [
    'Request failed with status code',
    'Network request failed',
    'NetworkError',
    'Request aborted',
  ],
});

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
