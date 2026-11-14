// Requiere `docker compose up -d` y las variables de DataAccess (ver docs/Desarrollo_Local.md).
// Se cargan acá, antes de crear los workers, que heredan el entorno.
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/Integration'],
  transform: require('../../jest.swc.cjs'),
  watchman: false,
};
