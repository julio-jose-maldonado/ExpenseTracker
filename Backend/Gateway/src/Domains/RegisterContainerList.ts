import type { healthV1 } from '@expense-tracker/proto';
import { container } from 'tsyringe';
import { BusinessHealthClient } from '../Shared/Grpc/BusinessHealthClient';
import { registerHealthDependencies } from './Health/RegisterHealthDependencies';

export interface ContainerConfig {
  businessGrpcAddress: string;
}

export function registerContainerList(config: ContainerConfig): void {
  registerHealthDependencies(config);
}

// Cierra los canales gRPC que creó el registro (al apagar el proceso o entre tests).
export function disposeContainerList(): void {
  if (container.isRegistered(BusinessHealthClient)) {
    container.resolve<healthV1.HealthServiceClient>(BusinessHealthClient).close();
  }
}
