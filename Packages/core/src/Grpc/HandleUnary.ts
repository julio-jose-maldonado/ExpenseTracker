import { randomUUID } from 'node:crypto';
import type { handleUnaryCall } from '@grpc/grpc-js';
import type { Logger } from 'pino';
import { runWithRequestId } from '../Context/RunWithRequestId';
import { AppError } from '../Errors/AppError';
import { ErrorCode } from '../Errors/ErrorCode';
import { grpcStatusFromError } from './GrpcStatusFromError';
import { REQUEST_ID_METADATA_KEY } from './RequestIdMetadataKey';

// Envuelve un handler unario: lee el requestId de la metadata, corre el handler
// dentro de ese contexto y convierte errores en status gRPC con el código en `details`.
export function handleUnary<Req, Res>(logger: Logger, fn: (request: Req) => Promise<Res>): handleUnaryCall<Req, Res> {
  return (call, callback) => {
    const [incoming] = call.metadata.get(REQUEST_ID_METADATA_KEY);
    const requestId = typeof incoming === 'string' ? incoming : randomUUID();

    runWithRequestId(requestId, () => {
      fn(call.request).then(
        (response) => callback(null, response),
        (error: unknown) => {
          logger.error({ err: error }, 'grpc handler failed');
          callback({
            code: grpcStatusFromError(error),
            details: error instanceof AppError ? error.code : ErrorCode.INTERNAL,
          });
        },
      );
    });
  };
}
