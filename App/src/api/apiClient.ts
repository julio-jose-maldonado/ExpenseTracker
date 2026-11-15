// Cliente HTTP hacia el Gateway (contrato en docs/API_Frontend.md).
// Las formas del sobre se mudan a @expense-tracker/types con la historia #1.
interface ApiSuccessBody<T> {
  data: T;
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

// `code` es lo que decide el comportamiento; `message` ya viene traducido para mostrar.
// Sin `code` (servidor caído, respuesta que no es JSON) se usa NETWORK.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NETWORK_ERROR_CODE = 'NETWORK';

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body as { error: unknown };
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { signal, headers: { accept: 'application/json' } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, NETWORK_ERROR_CODE, '');
  }

  const body = await readJson(response);
  if (!response.ok) {
    if (isApiErrorBody(body)) throw new ApiError(response.status, body.error.code, body.error.message);
    throw new ApiError(response.status, NETWORK_ERROR_CODE, '');
  }
  // Un 2xx sin el sobre `data` (por ejemplo, un index.html servido en lugar del Gateway) también es un error.
  if (!isApiSuccessBody(body)) throw new ApiError(response.status, NETWORK_ERROR_CODE, '');
  return (body as ApiSuccessBody<T>).data;
}

function isApiSuccessBody(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'data' in body;
}
