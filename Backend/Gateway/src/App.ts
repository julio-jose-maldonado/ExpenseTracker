import { createTranslator, type Logger, type Translate } from '@expense-tracker/core';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { HealthController } from './Domains/Health/2.Controller/HealthController';
import { attachContext } from './Middleware/AttachContext';
import { createErrorHandler } from './Middleware/CreateErrorHandler';
import { createRateLimit } from './Middleware/CreateRateLimit';
import { createRequestLog } from './Middleware/CreateRequestLog';
import { notFound } from './Middleware/NotFound';
import { type Endpoint, listEndpoints } from './Shared/RateLimit/Endpoints';
import { InMemoryRateLimitStore } from './Shared/RateLimit/InMemoryRateLimitStore';
import type { IRateLimitStore } from './Shared/RateLimit/IRateLimitStore';
import { assertRulesMatchEndpoints, RATE_LIMITS, type RateLimitTable } from './Shared/RateLimit/RateLimits';

export interface AppOptions {
  // Cuántos proxies propios hay delante del Gateway. Sin valor, ninguno.
  trustedProxyHops?: number;
  // Sin valores: la tabla real de límites y un contador en memoria (en producción se pasa el de Valkey).
  rateLimit?: { table?: RateLimitTable; store?: IRateLimitStore; now?: () => number };
}

export class App {
  readonly server: Express = express();
  readonly #translate: Translate;
  readonly #rateLimits: RateLimitTable;
  #endpoints: Endpoint[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly options: AppOptions = {},
  ) {
    this.#translate = createTranslator(logger);
    this.#rateLimits = options.rateLimit?.table ?? RATE_LIMITS;
    this.#settings();
    this.#middleware();
    this.#routes();
  }

  #settings(): void {
    this.server.disable('x-powered-by');
    // Cuántos proxies propios hay delante (en AWS: CloudFront y el ALB). Express toma la IP del cliente
    // de X-Forwarded-For salteando esa cantidad desde la derecha. Con 0 ignora el header, que cualquiera puede inventar.
    this.server.set('trust proxy', this.options.trustedProxyHops ?? 0);
  }

  #middleware(): void {
    this.server.use(attachContext);
    this.server.use(createRequestLog(this.logger));
    this.server.use(helmet());
    // Antes de leer el body: un request rechazado por el límite no gasta más trabajo.
    this.server.use(this.#rateLimit());
    this.server.use(express.json({ limit: '50kb' }));
  }

  #rateLimit(): RequestHandler {
    const { now = Date.now, store = new InMemoryRateLimitStore(now) } = this.options.rateLimit ?? {};
    return createRateLimit({ logger: this.logger, table: this.#rateLimits, store, now, endpoints: () => this.#endpoints });
  }

  #routes(): void {
    this.server.use(new HealthController().registerRoutes());
    // Con todas las rutas ya registradas: el rate limit las usa para saber a qué endpoint va cada request.
    this.#endpoints = listEndpoints(this.server);
    assertRulesMatchEndpoints(this.#rateLimits, this.#endpoints);
    this.server.use(notFound);
    this.server.use(createErrorHandler(this.logger, this.#translate));
  }
}
