// Requiere `docker compose up -d` (Valkey). Si existe el .env del Gateway se carga acá,
// antes de crear los workers, que heredan el entorno; sin él se usa el puerto por defecto del compose.
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/Integration'],
  transform: require('../../jest.swc.cjs'),
  setupFiles: ['reflect-metadata'],
  watchman: false,
};
