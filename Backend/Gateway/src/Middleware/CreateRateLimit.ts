import { AppError, ErrorCode, getClientIp, type Logger } from '@expense-tracker/core';
import type { RequestHandler } from 'express';
import { type Endpoint, findEndpointId } from '../Shared/RateLimit/Endpoints';
import type { IRateLimitStore } from '../Shared/RateLimit/IRateLimitStore';
import type { RateLimitTable } from '../Shared/RateLimit/RateLimits';
import { rateLimitSubjectFromIp } from '../Shared/RateLimit/RateLimitSubjectFromIp';

// Todas las rutas que no existen comparten una cuenta: si cada path tuviera la suya,
// un cliente podría crear contadores sin límite pidiendo paths distintos.
const UNMATCHED_ENDPOINT = 'unmatched';

// Con el contador caído fallan todos los requests: un aviso cada tanto alcanza.
const STORE_FAILURE_LOG_INTERVAL_MS = 30_000;

export interface RateLimitDependencies {
  logger: Logger;
  table: RateLimitTable;
  store: IRateLimitStore;
  // Función y no lista: el middleware se registra antes que las rutas.
  endpoints: () => Endpoint[];
  now?: () => number;
}

// Ventana fija: cuenta los requests de cada cliente a cada endpoint dentro de la ventana actual.
// Va después de attachContext (usa la IP del contexto) y antes de leer el body.
export function createRateLimit({ logger, table, store, endpoints, now = Date.now }: RateLimitDependencies): RequestHandler {
  const exempt = new Set(table.exempt);
  let nextStoreFailureLogAtMs = 0;

  return async (req, res, next) => {
    const endpoint = findEndpointId(endpoints(), req.method, req.path) ?? UNMATCHED_ENDPOINT;
    if (exempt.has(endpoint)) {
      next();
      return;
    }
    const { max, windowSeconds } = (table.overrides[endpoint] ?? table.general).perIp;
    const nowSeconds = Math.floor(now() / 1000);
    // El número de ventana va en la clave: cada ventana usa una clave nueva y la anterior vence sola.
    const window = Math.floor(nowSeconds / windowSeconds);
    const key = `rate-limit:${rateLimitSubjectFromIp(getClientIp())}:${endpoint}:${window}`;

    let count: number;
    try {
      count = await store.increment(key, windowSeconds);
    } catch (error) {
      // Una caída del contador no puede tirar toda la API: el request pasa sin límite.
      if (now() >= nextStoreFailureLogAtMs) {
        nextStoreFailureLogAtMs = now() + STORE_FAILURE_LOG_INTERVAL_MS;
        logger.error({ err: error }, 'rate limit store failed: requests are not being limited');
      }
      next();
      return;
    }

    if (count <= max) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(windowSeconds - (nowSeconds % windowSeconds)));
    next(new AppError(ErrorCode.TOO_MANY_REQUESTS, `Rate limit exceeded: ${endpoint} (${count}/${max} in ${windowSeconds}s)`));
  };
}
