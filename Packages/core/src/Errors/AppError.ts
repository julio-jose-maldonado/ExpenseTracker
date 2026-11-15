import type { ErrorCode } from './ErrorCode';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly internalMessage: string,
    options?: { cause?: unknown },
  ) {
    super(internalMessage, options);
    this.name = 'AppError';
  }
}
