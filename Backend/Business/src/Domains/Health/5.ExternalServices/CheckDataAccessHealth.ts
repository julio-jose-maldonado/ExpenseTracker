import { AppError, callUnary, ErrorCode } from '@expense-tracker/core';
import type { healthV1 } from '@expense-tracker/proto';

export async function checkDataAccessHealth(client: healthV1.HealthServiceClient): Promise<boolean> {
  try {
    const response = await callUnary(client.check.bind(client), {});
    return response.ok;
  } catch (error) {
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, `DataAccess health check failed: ${String(error)}`);
  }
}
