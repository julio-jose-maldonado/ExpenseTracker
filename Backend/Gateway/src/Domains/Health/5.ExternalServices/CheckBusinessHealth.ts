import { callUnary } from '@expense-tracker/core';
import type { healthV1 } from '@expense-tracker/proto';

// Si Business falla o no responde, callUnary rechaza con el AppError que corresponde.
export async function checkBusinessHealth(client: healthV1.HealthServiceClient): Promise<boolean> {
  const response = await callUnary(client.check.bind(client), {});
  return response.ok;
}
