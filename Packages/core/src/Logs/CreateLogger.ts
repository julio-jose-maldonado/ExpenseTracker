import pino, { type DestinationStream, type Logger } from 'pino';
import { getClientIp } from '../Context/GetClientIp';
import { getGrpcMethod } from '../Context/GetGrpcMethod';
import { getRequestId } from '../Context/GetRequestId';

// Campos que nunca tienen que quedar legibles en un log. Red de seguridad: lo normal es no loguearlos.
const SENSITIVE_FIELDS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'sessionId',
  'email',
  'cookie',
  'authorization',
  '["set-cookie"]',
];
// pino necesita la ruta de cada campo: se cubren el primer nivel y hasta dos objetos adentro
// (por ejemplo `password`, `body.password` y `request.body.password`).
const REDACT_PATHS = SENSITIVE_FIELDS.flatMap((field) => {
  const nested = field.startsWith('[') ? field : `.${field}`;
  return [field, `*${nested}`, `*.*${nested}`];
});

// Logs JSON en stdout, campos en snake_case.
export function createLogger(service: string, destination?: DestinationStream): Logger {
  return pino(
    {
      base: { service, environment: process.env.NODE_ENV ?? 'development' },
      messageKey: 'message',
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: { level: (label) => ({ level: label }) },
      // Datos del request en curso, en cada línea: permiten seguir un request y ver quién lo hizo.
      mixin: () => {
        const requestId = getRequestId();
        const clientIp = getClientIp();
        const grpcMethod = getGrpcMethod();
        return {
          ...(requestId && { request_id: requestId }),
          ...(clientIp && { client_ip: clientIp }),
          ...(grpcMethod && { grpc_method: grpcMethod }),
        };
      },
    },
    destination,
  );
}
