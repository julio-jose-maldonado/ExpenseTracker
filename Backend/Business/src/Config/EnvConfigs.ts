import { readRequiredEnv } from '@expense-tracker/core';

export interface EnvConfigs {
  grpcPort: number;
  dataAccessGrpcAddress: string;
}

export function loadEnvConfigs(): EnvConfigs {
  const env = readRequiredEnv(['GRPC_PORT', 'DATA_ACCESS_GRPC_ADDRESS']);
  return { grpcPort: Number(env.GRPC_PORT), dataAccessGrpcAddress: env.DATA_ACCESS_GRPC_ADDRESS };
}
