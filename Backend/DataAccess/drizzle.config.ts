import { existsSync } from 'node:fs';
import { readRequiredEnv } from '@expense-tracker/core';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit no carga .env solo; en AWS las variables llegan por el entorno.
if (existsSync('.env')) process.loadEnvFile('.env');

// Las migraciones las aplica el rol dueño del esquema, nunca el rol de la app.
const env = readRequiredEnv([
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'MIGRATOR_DATABASE_USER',
  'MIGRATOR_DATABASE_PASSWORD',
]);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/Database/Schema',
  out: './Database/Migrations',
  dbCredentials: {
    host: env.DATABASE_HOST,
    port: Number(env.DATABASE_PORT),
    database: env.DATABASE_NAME,
    user: env.MIGRATOR_DATABASE_USER,
    password: env.MIGRATOR_DATABASE_PASSWORD,
    ssl: false,
  },
  strict: true,
  verbose: true,
});
