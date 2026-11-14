import { requestContextStorage } from './RequestContextStorage';

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
