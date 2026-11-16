import { requestContextStorage } from './RequestContextStorage';

export function getClientIp(): string | undefined {
  return requestContextStorage.getStore()?.clientIp;
}
