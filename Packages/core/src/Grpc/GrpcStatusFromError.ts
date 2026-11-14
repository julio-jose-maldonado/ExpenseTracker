import { status } from '@grpc/grpc-js';
import { AppError } from '../Errors/AppError';
import { ErrorCode } from '../Errors/ErrorCode';

export function grpcStatusFromError(error: unknown): status {
  if (error instanceof AppError && error.code === ErrorCode.SERVICE_UNAVAILABLE) return status.UNAVAILABLE;
  return status.INTERNAL;
}
