// Códigos estables que viajan entre capas (por gRPC) y que el Gateway traduce con i18next.
// Nunca textos para el usuario acá.
export const ErrorCode = {
  INTERNAL: 'INTERNAL',
  NOT_FOUND: 'NOT_FOUND',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  // Request HTTP que el Gateway no puede leer (JSON malformado, encoding no soportado).
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
