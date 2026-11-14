import type { ErrorCode } from './ErrorCode';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly internalMessage: string,
  ) {
    super(internalMessage);
    this.name = 'AppError';
  }
}
