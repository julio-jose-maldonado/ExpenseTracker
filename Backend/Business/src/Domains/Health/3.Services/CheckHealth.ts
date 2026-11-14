import type { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { ICheckDataAccessHealth } from '../4.Repositories/CheckDataAccessHealth/ICheckDataAccessHealth';

export async function checkHealth(): Promise<healthV1.CheckResponse> {
  const dataAccessHealth = container.resolve<ICheckDataAccessHealth>(ICheckDataAccessHealth);
  return { ok: await dataAccessHealth.check() };
}
