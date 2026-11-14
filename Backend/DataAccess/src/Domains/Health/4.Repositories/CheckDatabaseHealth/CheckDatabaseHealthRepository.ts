import { inject, injectable } from 'tsyringe';
import { Database } from '../../../../Shared/Database/Database';
import { checkDatabaseHealth } from '../../5.ExternalServices/CheckDatabaseHealth';
import type { ICheckDatabaseHealth } from './ICheckDatabaseHealth';

@injectable()
export class CheckDatabaseHealthRepository implements ICheckDatabaseHealth {
  constructor(@inject(Database) private readonly db: Database) {}

  check(): Promise<boolean> {
    return checkDatabaseHealth(this.db);
  }
}
