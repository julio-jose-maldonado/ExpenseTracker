import { requestContextStorage } from './RequestContextStorage';

export function getGrpcMethod(): string | undefined {
  return requestContextStorage.getStore()?.grpcMethod;
}
