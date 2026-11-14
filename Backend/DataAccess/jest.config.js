module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  // Los de integración necesitan el Postgres de docker compose: van con `pnpm test:integration`.
  testPathIgnorePatterns: ['/test/Integration/'],
  transform: require('../../jest.swc.cjs'),
  watchman: false,
};
