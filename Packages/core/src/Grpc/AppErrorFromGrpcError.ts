import { status } from '@grpc/grpc-js';
import { AppError } from '../Errors/AppError';
import { ErrorCode } from '../Errors/ErrorCode';
import { isErrorCode } from '../Errors/IsErrorCode';

// Códigos que describen el request HTTP del cliente. Solo los decide el Gateway: si una capa de abajo
// devuelve uno, es un error entre servicios y no hay que culpar al cliente con un 400 o un 413.
const HTTP_REQUEST_CODES: ReadonlySet<ErrorCode> = new Set([ErrorCode.MALFORMED_REQUEST, ErrorCode.PAYLOAD_TOO_LARGE]);

// Convierte la falla de una llamada gRPC en un AppError. El error original queda como `cause`, para los logs.
// Si la capa de abajo mandó un ErrorCode en `details` (lo pone handleUnary), se respeta ese código.
// Si no (capa caída, deadline vencido, error de transporte), se decide por el status gRPC.
export function appErrorFromGrpcError(error: unknown): AppError {
  const { code, details } = (error ?? {}) as { code?: unknown; details?: unknown };
  const internalMessage = `gRPC call failed: ${String(error)}`;
  const options = { cause: error };
  if (isErrorCode(details) && !HTTP_REQUEST_CODES.has(details)) return new AppError(details, internalMessage, options);
  if (code === status.UNAVAILABLE || code === status.DEADLINE_EXCEEDED) {
    return new AppError(ErrorCode.SERVICE_UNAVAILABLE, internalMessage, options);
  }
  return new AppError(ErrorCode.INTERNAL, internalMessage, options);
}
