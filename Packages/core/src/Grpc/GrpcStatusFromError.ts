import { status } from '@grpc/grpc-js';
import { AppError } from '../Errors/AppError';
import type { ErrorCode } from '../Errors/ErrorCode';

// El status gRPC indica la categoría; el ErrorCode exacto viaja en `details`.
// `Record<ErrorCode, status>` obliga a decidir el status de cada código nuevo.
const GRPC_STATUS_BY_ERROR_CODE: Record<ErrorCode, status> = {
  INTERNAL: status.INTERNAL,
  NOT_FOUND: status.NOT_FOUND,
  SERVICE_UNAVAILABLE: status.UNAVAILABLE,
  MALFORMED_REQUEST: status.INVALID_ARGUMENT,
  PAYLOAD_TOO_LARGE: status.RESOURCE_EXHAUSTED,
};

export function grpcStatusFromError(error: unknown): status {
  if (!(error instanceof AppError)) return status.INTERNAL;
  // El `??` cubre un código que esta versión no conoce (servicios con versiones distintas de core en un deploy).
  return GRPC_STATUS_BY_ERROR_CODE[error.code] ?? status.INTERNAL;
}
