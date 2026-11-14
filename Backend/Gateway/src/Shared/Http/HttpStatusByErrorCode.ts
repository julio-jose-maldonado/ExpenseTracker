import type { ErrorCode } from '@expense-tracker/core';

export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  INTERNAL: 500,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  MALFORMED_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
};
