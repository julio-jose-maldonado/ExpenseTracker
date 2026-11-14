import type { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { DataAccessHealthClient } from '../Shared/Grpc/DataAccessHealthClient';
import { registerHealthDependencies } from './Health/RegisterHealthDependencies';

export interface ContainerConfig {
  dataAccessGrpcAddress: string;
}

export function registerContainerList(config: ContainerConfig): void {
  registerHealthDependencies(config);
}

// Cierra los canales gRPC que creó el registro (al apagar el proceso o entre tests).
export function disposeContainerList(): void {
  if (container.isRegistered(DataAccessHealthClient)) {
    container.resolve<healthV1.HealthServiceClient>(DataAccessHealthClient).close();
  }
}
