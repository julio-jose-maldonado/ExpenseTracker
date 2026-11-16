import { requestContextStorage } from './RequestContextStorage';

export function getRequestDeadline(): number | undefined {
  return requestContextStorage.getStore()?.deadline;
}
