import { AppError, ErrorCode } from '@expense-tracker/core';
import { container } from 'tsyringe';
import { ICheckBusinessHealth } from '../4.Repositories/CheckBusinessHealth/ICheckBusinessHealth';

export async function checkChainHealth(): Promise<void> {
  const businessHealth = container.resolve<ICheckBusinessHealth>(ICheckBusinessHealth);
  if (!(await businessHealth.check())) {
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Business reported not ok');
  }
}
