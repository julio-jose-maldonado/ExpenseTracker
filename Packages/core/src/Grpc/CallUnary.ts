import { type CallOptions, type ClientUnaryCall, Metadata, type ServiceError } from '@grpc/grpc-js';
import { getRequestDeadline } from '../Context/GetRequestDeadline';
import { getRequestId } from '../Context/GetRequestId';
import { appErrorFromGrpcError } from './AppErrorFromGrpcError';
import { REQUEST_ID_METADATA_KEY } from './RequestIdMetadataKey';

type UnaryMethod<Req, Res> = (
  request: Req,
  metadata: Metadata,
  options: Partial<CallOptions>,
  callback: (error: ServiceError | null, response: Res) => void,
) => ClientUnaryCall;

const DEFAULT_TIMEOUT_MS = 3000;

// Llama un método unario propagando el requestId y el deadline del contexto.
// Si falla, rechaza siempre con un AppError (ver appErrorFromGrpcError).
// Uso: callUnary(client.check.bind(client), request)
export function callUnary<Req, Res>(
  method: UnaryMethod<Req, Res>,
  request: Req,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Res> {
  const metadata = new Metadata();
  const requestId = getRequestId();
  if (requestId) metadata.set(REQUEST_ID_METADATA_KEY, requestId);

  // El límite propio nunca extiende el que ya traía el request: si al caller le queda 1 s,
  // no tiene sentido que este salto espere 3.
  const deadline = Math.min(Date.now() + timeoutMs, getRequestDeadline() ?? Infinity);

  return new Promise((resolve, reject) => {
    try {
      method(request, metadata, { deadline }, (error, response) =>
        error ? reject(appErrorFromGrpcError(error)) : resolve(response),
      );
    } catch (error) {
      // grpc-js también puede fallar antes de enviar la llamada (por ejemplo, con el cliente ya cerrado).
      reject(appErrorFromGrpcError(error));
    }
  });
}
