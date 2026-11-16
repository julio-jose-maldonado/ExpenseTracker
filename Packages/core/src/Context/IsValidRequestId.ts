// Solo se acepta un request id con formato seguro: termina en cada línea de log.
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && VALID_REQUEST_ID.test(value);
}
