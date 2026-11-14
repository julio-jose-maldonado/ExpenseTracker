import { AsyncResource } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { Logger } from '@expense-tracker/core';
import type { RequestHandler } from 'express';

// Una línea de log por request. Va después de attachContext para heredar el request id.
// 'close' (y no 'finish') para registrar también los requests que el cliente cortó antes de la respuesta.
export function createRequestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on(
      'close',
      AsyncResource.bind(() =>
        logger.info(
          {
            http_method: req.method,
            // Pendiente: con routers montados bajo un prefijo, baseUrl ya volvió al del padre en este punto.
            route: req.route ? `${req.baseUrl}${String(req.route.path)}` : req.path,
            status_code: res.statusCode,
            aborted: !res.writableFinished,
            duration_gateway_ms: Math.round(performance.now() - start),
          },
          'request completed',
        ),
      ),
    );
    next();
  };
}
