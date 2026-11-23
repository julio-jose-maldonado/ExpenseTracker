import { type Logger, type Translate, TranslationKeys } from '@expense-tracker/core';
import type { ErrorRequestHandler } from 'express';
import { errorCodeFromError } from '../Shared/Http/ErrorCodeFromError';
import { HTTP_STATUS_BY_ERROR_CODE } from '../Shared/Http/HttpStatusByErrorCode';

// Status HTTP real + código estable + mensaje traducido. El detalle interno solo va a los logs.
export function createErrorHandler(logger: Logger, translate: Translate): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    const code = errorCodeFromError(error);
    const status = HTTP_STATUS_BY_ERROR_CODE[code];
    if (status >= 500) logger.error({ err: error, error_code: code }, 'request failed');
    // Si la respuesta ya empezó a salir no se puede cambiar el status: Express corta la conexión.
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(status).json({ error: { code, message: translate(TranslationKeys.errors[code]) } });
  };
}
