import { type CallOptions, type ClientUnaryCall, Metadata, type ServiceError } from '@grpc/grpc-js';
import { getRequestId } from '../Context/GetRequestId';
import { REQUEST_ID_METADATA_KEY } from './RequestIdMetadataKey';

type UnaryMethod<Req, Res> = (
  request: Req,
  metadata: Metadata,
  options: Partial<CallOptions>,
  callback: (error: ServiceError | null, response: Res) => void,
) => ClientUnaryCall;

const DEFAULT_TIMEOUT_MS = 3000;

// Llama un método unario propagando el requestId del contexto por metadata.
// Uso: callUnary(client.check.bind(client), request)
export function callUnary<Req, Res>(
  method: UnaryMethod<Req, Res>,
  request: Req,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Res> {
  const metadata = new Metadata();
  const requestId = getRequestId();
  if (requestId) metadata.set(REQUEST_ID_METADATA_KEY, requestId);

  return new Promise((resolve, reject) => {
    method(request, metadata, { deadline: Date.now() + timeoutMs }, (error, response) =>
      error ? reject(error) : resolve(response),
    );
  });
}
