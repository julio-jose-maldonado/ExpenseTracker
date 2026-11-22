import { AppError, ErrorCode } from '@expense-tracker/core';

// Errores de express.json (http-errors): traen un status 4xx propio y `expose: true`
// porque son culpa del cliente. Sin esto se responderían como 500.
interface ClientHttpError {
  status: number;
  expose: true;
}

function isClientHttpError(error: unknown): error is ClientHttpError {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as Partial<ClientHttpError>;
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
}

// Así falla el router de Express cuando un parámetro de la ruta trae una codificación inválida
// (`/expenses/%zz`): un URIError con status 400, sin `expose`. También es culpa del cliente.
function isRouteParamDecodeError(error: unknown): boolean {
  return error instanceof URIError && (error as { status?: unknown }).status === 400;
}

export function errorCodeFromError(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  if (isRouteParamDecodeError(error)) return ErrorCode.MALFORMED_REQUEST;
  if (isClientHttpError(error)) {
    return error.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.MALFORMED_REQUEST;
  }
  return ErrorCode.INTERNAL;
}
