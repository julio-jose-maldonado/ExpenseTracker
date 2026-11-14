import type { Logger } from '@expense-tracker/core';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { i18n } from 'i18next';
import { HealthController } from './Domains/Health/2.Controller/HealthController';
import { createI18n } from './Localization/CreateI18n';
import { attachContext } from './Middleware/AttachContext';
import { createErrorHandler } from './Middleware/CreateErrorHandler';
import { createRequestLog } from './Middleware/CreateRequestLog';
import { notFound } from './Middleware/NotFound';

export class App {
  readonly server: Express = express();
  readonly #i18n: i18n = createI18n();

  constructor(private readonly logger: Logger) {
    this.#settings();
    this.#middleware();
    this.#routes();
  }

  #settings(): void {
    this.server.disable('x-powered-by');
  }

  #middleware(): void {
    this.server.use(attachContext);
    this.server.use(createRequestLog(this.logger));
    this.server.use(helmet());
    this.server.use(express.json({ limit: '50kb' }));
  }

  #routes(): void {
    this.server.use(new HealthController().registerRoutes());
    this.server.use(notFound);
    this.server.use(createErrorHandler(this.logger, this.#i18n));
  }
}
