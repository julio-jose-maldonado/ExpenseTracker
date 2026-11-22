import { readRequiredEnv } from '@expense-tracker/core';

export interface EnvConfigs {
  port: number;
  businessGrpcAddress: string;
  // URL del Valkey del Gateway (contadores del rate limit; después, las sesiones).
  valkeyUrl: string;
  // Cuántos proxies propios hay delante del Gateway (ver App: 'trust proxy').
  trustedProxyHops: number;
  // Reemplaza el máximo del límite general de requests (ver RateLimits). Sin valor, el de la tabla.
  rateLimitGeneralMax: number | undefined;
}

export function loadEnvConfigs(): EnvConfigs {
  const env = readRequiredEnv(['PORT', 'BUSINESS_GRPC_ADDRESS', 'VALKEY_URL']);
  return {
    port: Number(env.PORT),
    businessGrpcAddress: env.BUSINESS_GRPC_ADDRESS,
    valkeyUrl: readValkeyUrl(env.VALKEY_URL),
    trustedProxyHops: readTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
    rateLimitGeneralMax: readRateLimitGeneralMax(process.env.RATE_LIMIT_GENERAL_MAX),
  };
}

// `redis://` sin cifrar (local) o `rediss://` con TLS (AWS). El mensaje no muestra el valor: puede traer una contraseña.
function readValkeyUrl(value: string): string {
  const url = URL.canParse(value) ? new URL(value) : undefined;
  const isValkeyProtocol = url?.protocol === 'redis:' || url?.protocol === 'rediss:';
  // Sin host el cliente se conectaría a localhost sin avisar, y el Gateway quedaría sin límite de requests.
  if (!isValkeyProtocol || !url?.hostname) {
    throw new Error('VALKEY_URL tiene que ser una URL redis:// o rediss:// con host');
  }
  return value;
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

// Con tope: un valor enorme por error de tipeo dejaría la API sin límite sin que nadie lo note.
const MAX_RATE_LIMIT_GENERAL_MAX = 1_000_000;

function readRateLimitGeneralMax(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const max = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(max >= 1 && max <= MAX_RATE_LIMIT_GENERAL_MAX)) {
    throw new Error(`RATE_LIMIT_GENERAL_MAX tiene que ser un entero entre 1 y ${MAX_RATE_LIMIT_GENERAL_MAX} (recibido: ${value})`);
  }
  return max;
}
