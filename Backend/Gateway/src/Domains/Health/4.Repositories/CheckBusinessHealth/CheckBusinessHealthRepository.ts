import type { healthV1 } from '@expense-tracker/proto';
import { inject, injectable } from 'tsyringe';
import { BusinessHealthClient } from '../../../../Shared/Grpc/BusinessHealthClient';
import { checkBusinessHealth } from '../../5.ExternalServices/CheckBusinessHealth';
import type { ICheckBusinessHealth } from './ICheckBusinessHealth';

@injectable()
export class CheckBusinessHealthRepository implements ICheckBusinessHealth {
  constructor(@inject(BusinessHealthClient) private readonly client: healthV1.HealthServiceClient) {}

  check(): Promise<boolean> {
    return checkBusinessHealth(this.client);
  }
}
