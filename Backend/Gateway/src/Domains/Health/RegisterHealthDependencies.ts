import { credentials } from '@grpc/grpc-js';
import { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { BusinessHealthClient } from '../../Shared/Grpc/BusinessHealthClient';
import { CheckBusinessHealthRepository } from './4.Repositories/CheckBusinessHealth/CheckBusinessHealthRepository';
import { ICheckBusinessHealth } from './4.Repositories/CheckBusinessHealth/ICheckBusinessHealth';

export function registerHealthDependencies(config: { businessGrpcAddress: string }): void {
  container.register(BusinessHealthClient, {
    useValue: new healthV1.HealthServiceClient(config.businessGrpcAddress, credentials.createInsecure()),
  });
  container.register(ICheckBusinessHealth, { useClass: CheckBusinessHealthRepository });
}
