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

export function errorCodeFromError(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  if (isClientHttpError(error)) {
    return error.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.MALFORMED_REQUEST;
  }
  return ErrorCode.INTERNAL;
}
