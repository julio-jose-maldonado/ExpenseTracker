import { readRequiredEnv } from '@expense-tracker/core';

export interface EnvConfigs {
  port: number;
  businessGrpcAddress: string;
}

export function loadEnvConfigs(): EnvConfigs {
  const env = readRequiredEnv(['PORT', 'BUSINESS_GRPC_ADDRESS']);
  return { port: Number(env.PORT), businessGrpcAddress: env.BUSINESS_GRPC_ADDRESS };
}
