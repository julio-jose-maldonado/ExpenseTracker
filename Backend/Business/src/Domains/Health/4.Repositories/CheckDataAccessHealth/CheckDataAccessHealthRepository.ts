import type { healthV1 } from '@expense-tracker/proto';
import { inject, injectable } from 'tsyringe';
import { DataAccessHealthClient } from '../../../../Shared/Grpc/DataAccessHealthClient';
import { checkDataAccessHealth } from '../../5.ExternalServices/CheckDataAccessHealth';
import type { ICheckDataAccessHealth } from './ICheckDataAccessHealth';

@injectable()
export class CheckDataAccessHealthRepository implements ICheckDataAccessHealth {
  constructor(@inject(DataAccessHealthClient) private readonly client: healthV1.HealthServiceClient) {}

  check(): Promise<boolean> {
    return checkDataAccessHealth(this.client);
  }
}
