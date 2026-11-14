import type { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { ICheckDatabaseHealth } from '../4.Repositories/CheckDatabaseHealth/ICheckDatabaseHealth';

export async function checkHealth(): Promise<healthV1.CheckResponse> {
  const databaseHealth = container.resolve<ICheckDatabaseHealth>(ICheckDatabaseHealth);
  return { ok: await databaseHealth.check() };
}
