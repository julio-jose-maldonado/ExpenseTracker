import { status } from '@grpc/grpc-js';
import { AppError } from '../../src/Errors/AppError';
import { ErrorCode } from '../../src/Errors/ErrorCode';
import { grpcStatusFromError } from '../../src/Grpc/GrpcStatusFromError';

describe('grpcStatusFromError', () => {
  it('devuelve el status de la categoría del código', () => {
    expect(grpcStatusFromError(new AppError(ErrorCode.NOT_FOUND, 'x'))).toBe(status.NOT_FOUND);
    expect(grpcStatusFromError(new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'x'))).toBe(status.UNAVAILABLE);
  });

  it('devuelve INTERNAL para un error que no es AppError', () => {
    expect(grpcStatusFromError(new Error('boom'))).toBe(status.INTERNAL);
  });

  it('devuelve INTERNAL para un AppError con un código que no está en la tabla', () => {
    const unknownCode = 'CODE_FROM_A_NEWER_VERSION' as ErrorCode;

    expect(grpcStatusFromError(new AppError(unknownCode, 'x'))).toBe(status.INTERNAL);
  });
});
