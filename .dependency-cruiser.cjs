// Reglas de arquitectura: capas por dominio dentro de cada servicio, servicios aislados entre sí (solo gRPC).
// Capas por dominio: 2.Controller → 3.Services → 4.Repositories → 5.ExternalServices
const LAYER = (n) => String.raw`^Backend/[^/]+/src/Domains/[^/]+/${n}\.`;

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-service-imports',
      comment: 'Las capas solo se hablan por gRPC; lo compartido va en Packages/.',
      severity: 'error',
      from: { path: '^Backend/([^/]+)/' },
      to: { path: '^Backend/([^/]+)/', pathNot: '^Backend/$1/' },
    },
    {
      name: 'no-cross-domain-imports',
      comment: 'Un dominio no importa de otro dominio.',
      severity: 'error',
      from: { path: '^(Backend/[^/]+/src/Domains)/([^/]+)/' },
      to: { path: '^Backend/[^/]+/src/Domains/([^/]+)/', pathNot: ['^$1/$2/'] },
    },
    {
      name: 'controller-only-calls-services',
      severity: 'error',
      from: { path: LAYER(2) },
      to: { path: [LAYER(4), LAYER(5)] },
    },
    {
      name: 'services-do-not-skip-repositories',
      comment: 'Services usan las interfaces de 4.Repositories, nunca 5.ExternalServices directo.',
      severity: 'error',
      from: { path: LAYER(3) },
      to: { path: [LAYER(2), LAYER(5)] },
    },
    {
      name: 'repositories-do-not-go-up',
      severity: 'error',
      from: { path: LAYER(4) },
      to: { path: [LAYER(2), LAYER(3)] },
    },
    {
      name: 'external-services-do-not-go-up',
      severity: 'error',
      from: { path: LAYER(5) },
      to: { path: [LAYER(2), LAYER(3), LAYER(4)] },
    },
    {
      name: 'only-data-access-touches-the-database',
      severity: 'error',
      from: { path: '^(Backend/(Gateway|Business)|Packages)/' },
      to: { path: 'node_modules/(drizzle-orm|drizzle-kit|pg|ioredis|redis)/' },
    },
  ],
  options: {
    parser: 'swc',
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(/dist/|/generated/|/test/)' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    combinedDependencies: true,
  },
};
