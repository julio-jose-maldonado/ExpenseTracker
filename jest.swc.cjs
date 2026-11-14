// Transform compartido de Jest: SWC en vez de ts-jest (TS 7 no tiene API JS).
// Legacy decorators + metadata para TypeORM y tsyringe.
module.exports = {
  '^.+\\.ts$': [
    '@swc/jest',
    {
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'commonjs' },
    },
  ],
};
