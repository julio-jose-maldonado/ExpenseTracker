import { type RequestContext, requestContextStorage } from './RequestContextStorage';

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}
