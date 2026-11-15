import { readRequiredEnv } from '@expense-tracker/core';

export interface EnvConfigs {
  port: number;
  businessGrpcAddress: string;
  // Cuántos proxies propios hay delante del Gateway (ver App: 'trust proxy').
  trustedProxyHops: number;
}

export function loadEnvConfigs(): EnvConfigs {
  const env = readRequiredEnv(['PORT', 'BUSINESS_GRPC_ADDRESS']);
  return {
    port: Number(env.PORT),
    businessGrpcAddress: env.BUSINESS_GRPC_ADDRESS,
    trustedProxyHops: readTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
  };
}

// Un número más alto que la cantidad real de proxies deja que el cliente elija su propia IP
// (Express termina tomando un valor de X-Forwarded-For que escribió él). Con tope, un error de tipeo no arranca.
const MAX_TRUSTED_PROXY_HOPS = 5;

// Opcional: sin la variable no se confía en ningún proxy (lo correcto en local, sin nada delante).
function readTrustedProxyHops(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const hops = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(hops <= MAX_TRUSTED_PROXY_HOPS)) {
    throw new Error(`TRUSTED_PROXY_HOPS tiene que ser un entero entre 0 y ${MAX_TRUSTED_PROXY_HOPS} (recibido: ${value})`);
  }
  return hops;
}
