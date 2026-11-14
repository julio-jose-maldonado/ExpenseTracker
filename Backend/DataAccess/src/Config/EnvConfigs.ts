import { readRequiredEnv } from '@expense-tracker/core';
import type { DatabaseConfig } from '../Shared/Database/CreateDatabase';

export interface EnvConfigs {
  grpcPort: number;
  database: DatabaseConfig;
}

export function loadEnvConfigs(): EnvConfigs {
  const env = readRequiredEnv([
    'GRPC_PORT',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_NAME',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
  ]);
  return {
    grpcPort: Number(env.GRPC_PORT),
    database: {
      host: env.DATABASE_HOST,
      port: Number(env.DATABASE_PORT),
      database: env.DATABASE_NAME,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
    },
  };
}
