import { requestContextStorage } from './RequestContextStorage';

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestContextStorage.run({ requestId }, fn);
}
