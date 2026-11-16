import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { type handleUnaryCall, status } from '@grpc/grpc-js';
import type { Logger } from 'pino';
import { isValidRequestId } from '../Context/IsValidRequestId';
import { runWithRequestContext } from '../Context/RunWithRequestContext';
import { AppError } from '../Errors/AppError';
import { ErrorCode } from '../Errors/ErrorCode';
import { grpcStatusFromError } from './GrpcStatusFromError';
import { REQUEST_ID_METADATA_KEY } from './RequestIdMetadataKey';

// Envuelve un handler unario: arma el contexto del request (requestId de la metadata, deadline y método
// de la llamada), corre el handler adentro, convierte errores en status gRPC con el código en `details`
// y deja una línea de log por llamada con el status y la duración (más un aviso si el caller se va antes).
export function handleUnary<Req, Res>(logger: Logger, fn: (request: Req) => Promise<Res>): handleUnaryCall<Req, Res> {
  return (call, callback) => {
    const start = performance.now();
    const [incoming] = call.metadata.get(REQUEST_ID_METADATA_KEY);
    const requestId = isValidRequestId(incoming) ? incoming : randomUUID();
    // Sin deadline, grpc-js devuelve Infinity.
    const deadline = Number(call.getDeadline());
    const context = {
      requestId,
      deadline: Number.isFinite(deadline) ? deadline : undefined,
      grpcMethod: call.getPath(),
    };

    let responded = false;
    const logCompleted = (code: status, errorCode?: ErrorCode) => {
      responded = true;
      logger.info(
        {
          grpc_status: status[code],
          error_code: errorCode,
          // true: el caller ya no esperaba (canceló o se le venció el deadline) y no recibió esta respuesta.
          cancelled: call.cancelled || Date.now() > deadline,
          duration_ms: Math.round(performance.now() - start),
        },
        'grpc request completed',
      );
    };

    runWithRequestContext(context, () => {
      // El caller canceló o se le venció el deadline. Se avisa en el momento, porque el handler puede
      // tardar mucho más en terminar (o no terminar nunca) y recién ahí sale la línea de cierre.
      // grpc-js emite 'cancelled' también al cerrar una llamada que terminó bien: por eso el `responded`.
      call.once(
        'cancelled',
        AsyncResource.bind(() => {
          if (responded) return;
          logger.warn(
            { duration_ms: Math.round(performance.now() - start) },
            'grpc caller gave up before the response',
          );
        }),
      );
      // El `async` convierte en rechazo un throw sincrónico de `fn`; sin eso la llamada quedaría sin responder.
      (async () => fn(call.request))().then(
        (response) => {
          logCompleted(status.OK);
          callback(null, response);
        },
        (error: unknown) => {
          const code = grpcStatusFromError(error);
          const details = error instanceof AppError ? error.code : ErrorCode.INTERNAL;
          // Solo las fallas del servicio se registran como error, con su detalle. Un error de dominio
          // (por ejemplo NOT_FOUND) es una respuesta esperada: le alcanza con la línea de cierre.
          if (code === status.INTERNAL || code === status.UNAVAILABLE) {
            logger.error({ err: error, error_code: details }, 'grpc handler failed');
          }
          logCompleted(code, details);
          callback({ code, details });
        },
      );
    });
  };
}
