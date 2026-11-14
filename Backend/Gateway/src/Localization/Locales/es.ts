import type { ErrorCode } from '@expense-tracker/core';

// `Record<ErrorCode, string>` obliga a tener un mensaje por cada código.
export const es = {
  errors: {
    INTERNAL: 'Ocurrió un error inesperado. Intentá de nuevo más tarde.',
    NOT_FOUND: 'El recurso solicitado no existe.',
    SERVICE_UNAVAILABLE: 'El servicio no está disponible en este momento. Intentá de nuevo más tarde.',
    MALFORMED_REQUEST: 'La solicitud no tiene un formato válido.',
    PAYLOAD_TOO_LARGE: 'La solicitud es demasiado grande.',
  } satisfies Record<ErrorCode, string>,
};
