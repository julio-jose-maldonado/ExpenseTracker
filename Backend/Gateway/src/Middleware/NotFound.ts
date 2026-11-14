import { AppError, ErrorCode } from '@expense-tracker/core';
import type { RequestHandler } from 'express';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(ErrorCode.NOT_FOUND, `Route not found: ${req.method} ${req.path}`));
};
