import pino, { type DestinationStream, type Logger } from 'pino';
import { getRequestId } from '../Context/GetRequestId';

// Logs JSON en stdout, campos en snake_case.
export function createLogger(service: string, destination?: DestinationStream): Logger {
  return pino(
    {
      base: { service, environment: process.env.NODE_ENV ?? 'development' },
      messageKey: 'message',
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: { level: (label) => ({ level: label }) },
      mixin: () => {
        const requestId = getRequestId();
        return requestId ? { request_id: requestId } : {};
      },
    },
    destination,
  );
}
