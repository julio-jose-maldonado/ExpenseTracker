import { handleUnary, type Logger } from '@expense-tracker/core';
import type { healthV1 } from '@expense-tracker/proto';
import { checkHealth } from '../3.Services/CheckHealth';

export function createHealthController(logger: Logger): healthV1.HealthServiceServer {
  return { check: handleUnary(logger, checkHealth) };
}
