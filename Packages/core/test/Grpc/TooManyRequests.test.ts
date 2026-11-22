import { status } from '@grpc/grpc-js';
import { AppError } from '../../src/Errors/AppError';
import { ErrorCode } from '../../src/Errors/ErrorCode';
import { appErrorFromGrpcError } from '../../src/Grpc/AppErrorFromGrpcError';
import { grpcStatusFromError } from '../../src/Grpc/GrpcStatusFromError';

describe('TOO_MANY_REQUESTS entre capas', () => {
  it('existe como código de error', () => {
    expect(ErrorCode.TOO_MANY_REQUESTS).toBe('TOO_MANY_REQUESTS');
  });

  it('viaja como RESOURCE_EXHAUSTED', () => {
    expect(grpcStatusFromError(new AppError(ErrorCode.TOO_MANY_REQUESTS, 'x'))).toBe(status.RESOURCE_EXHAUSTED);
  });

  // El límite de requests lo decide solo el Gateway: una capa de abajo no puede hacerle responder 429 al cliente.
  it('si lo devuelve una capa de abajo, llega como INTERNAL', () => {
    const grpcError = { code: status.RESOURCE_EXHAUSTED, details: 'TOO_MANY_REQUESTS' };

    expect(appErrorFromGrpcError(grpcError).code).toBe(ErrorCode.INTERNAL);
  });
});
