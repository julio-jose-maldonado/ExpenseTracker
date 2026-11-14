import { container } from 'tsyringe';
import { CheckDatabaseHealthRepository } from './4.Repositories/CheckDatabaseHealth/CheckDatabaseHealthRepository';
import { ICheckDatabaseHealth } from './4.Repositories/CheckDatabaseHealth/ICheckDatabaseHealth';

export function registerHealthDependencies(): void {
  container.register(ICheckDatabaseHealth, { useClass: CheckDatabaseHealthRepository });
}
