// Mutation testing (Stryker) del Gateway. Se corre sobre los archivos tocados, no sobre todo el
// paquete: `pnpm --filter @expense-tracker/gateway mutation --mutate <archivo>,<archivo>`.
// Sin checker de TypeScript: TS 7 no tiene API JS. SWC no chequea tipos, así que un mutante que no
// compilaría puede quedar como sobreviviente: revisarlo a mano.
import { createRequire } from 'node:module';

// La config de Jest se carga acá, desde la carpeta real: Stryker corre en una copia del paquete
// (.stryker-tmp/) donde la ruta relativa a jest.swc.cjs de la raíz no existe. Por eso `configFile`
// apunta a package.json (no tiene clave "jest"): así Stryker no vuelve a cargar jest.config.js en la copia.
const jestConfig = createRequire(import.meta.url)('./jest.config.js');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'jest',
  // Con pnpm Stryker no encuentra solo los plugins (busca al lado de su propio paquete): se nombran acá.
  plugins: ['@stryker-mutator/jest-runner'],
  jest: { projectType: 'custom', configFile: 'package.json', config: jestConfig },
  coverageAnalysis: 'perTest',
  mutate: ['src/**/*.ts'],
  reporters: ['clear-text', 'progress'],
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  // Stryker reescribe el tsconfig del sandbox con la API JS de TypeScript, que TS 7 no tiene (falla con
  // "ts.parseConfigFileTextToJson is not a function"). Ese paso solo corre si el archivo existe: este no.
  // Jest transforma con SWC, que no lee el tsconfig, así que no hace falta.
  tsconfigFile: 'tsconfig.stryker-none.json',
};
