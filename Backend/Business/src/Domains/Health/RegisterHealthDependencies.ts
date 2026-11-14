import { credentials } from '@grpc/grpc-js';
import { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { DataAccessHealthClient } from '../../Shared/Grpc/DataAccessHealthClient';
import { CheckDataAccessHealthRepository } from './4.Repositories/CheckDataAccessHealth/CheckDataAccessHealthRepository';
import { ICheckDataAccessHealth } from './4.Repositories/CheckDataAccessHealth/ICheckDataAccessHealth';

export function registerHealthDependencies(config: { dataAccessGrpcAddress: string }): void {
  container.register(DataAccessHealthClient, {
    useValue: new healthV1.HealthServiceClient(config.dataAccessGrpcAddress, credentials.createInsecure()),
  });
  container.register(ICheckDataAccessHealth, { useClass: CheckDataAccessHealthRepository });
}
