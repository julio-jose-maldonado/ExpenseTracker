import { AsyncResource } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { Logger } from '@expense-tracker/core';
import type { Request, RequestHandler } from 'express';

// El user agent y el path los manda el cliente y pueden ser enormes: se recortan para no inflar los logs.
const MAX_USER_AGENT_LENGTH = 200;
const MAX_UNMATCHED_PATH_LENGTH = 200;

// Una línea de log por request. Va después de attachContext para heredar el request id.
// 'close' (y no 'finish') para registrar también los requests que el cliente cortó antes de la respuesta.
export function createRequestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    const matchedRoute = trackMatchedRoute(req);
    res.on(
      'close',
      AsyncResource.bind(() =>
        logger.info(
          {
            http_method: req.method,
            route: matchedRoute() ?? req.path.slice(0, MAX_UNMATCHED_PATH_LENGTH),
            status_code: res.statusCode,
            user_agent: req.get('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH),
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

// Devuelve una función que da la ruta que atendió el request, con el prefijo del router: `/expenses/:id`.
// Hay que tomarla en el momento en que Express asigna `req.route`: si el handler falla, cuando se escribe
// el log `req.baseUrl` ya volvió al del router padre y el prefijo se perdió.
function trackMatchedRoute(req: Request): () => string | undefined {
  let route: Request['route'];
  let matchedRoute: string | undefined;
  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get: () => route,
    set: (value: Request['route']) => {
      route = value;
      matchedRoute = value ? `${req.baseUrl}${String(value.path)}` : undefined;
    },
  });
  return () => matchedRoute;
}
