module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: require('../../jest.swc.cjs'),
  setupFiles: ['reflect-metadata'],
  watchman: false,
};
