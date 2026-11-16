import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { isValidRequestId, REQUEST_ID_METADATA_KEY, runWithRequestContext } from '@expense-tracker/core';
import type { Request, RequestHandler } from 'express';

export const attachContext: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_METADATA_KEY);
  const requestId = isValidRequestId(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_METADATA_KEY, requestId);
  runWithRequestContext({ requestId, clientIp: clientIpFromRequest(req) }, () => next());
};

// req.ip respeta 'trust proxy' (ver App): sin proxies de confianza es la IP de la conexión.
// Con proxies de confianza sale de X-Forwarded-For, que Express no valida: si no es una IP,
// se usa la de la conexión, para que un texto cualquiera no termine en los logs.
function clientIpFromRequest(req: Request): string | undefined {
  return req.ip && isIP(req.ip) ? req.ip : req.socket.remoteAddress;
}
