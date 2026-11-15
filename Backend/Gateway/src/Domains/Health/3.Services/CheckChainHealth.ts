import { AppError, ErrorCode } from '@expense-tracker/core';
import { container } from 'tsyringe';
import { ICheckBusinessHealth } from '../4.Repositories/CheckBusinessHealth/ICheckBusinessHealth';

// Dependencias en el último parámetro: en producción salen del contenedor, en un test se pasan a mano.
export async function checkChainHealth({
  businessHealth = container.resolve<ICheckBusinessHealth>(ICheckBusinessHealth),
}: { businessHealth?: ICheckBusinessHealth } = {}): Promise<void> {
  if (!(await businessHealth.check())) {
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Business reported not ok');
  }
}
