import { container } from 'tsyringe';
import { Database } from '../Shared/Database/Database';
import { registerHealthDependencies } from './Health/RegisterHealthDependencies';

export interface ContainerConfig {
  db: Database;
}

export function registerContainerList(config: ContainerConfig): void {
  container.register(Database, { useValue: config.db });
  registerHealthDependencies();
}
