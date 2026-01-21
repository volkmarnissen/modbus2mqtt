import type { Config } from 'jest'

const config: Config = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['__tests__/server', '__tests__/specification'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          resolveJsonModule: true,
          target: 'es2022',
          isolatedModules: true,
        },
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/*.test.ts?(x)', '**/*.spec.ts?(x)', '**/*_test.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleDirectories: ['src', 'node_modules'],
  moduleNameMapper: {
    // Map ESM-style .js imports in our src/* to corresponding .ts files
    '^(src/.*)\\.js$': '<rootDir>/$1.ts',
    '^(\\.{1,2}/)((?:shared|specification|server)/.*)\\.js$': '<rootDir>/src/$2.ts',
    // Map relative .js imports in our source, but avoid node_modules cjs paths
    '^(?!.*cjs/)(\\.{1,2}/.*)\\.js$': '$1.ts',
  },
  maxWorkers: 1,
  //  setupFiles: ["<rootDir>/.jest/setEnvVars.js"]
  // collectCoverage: true,
  // coverageDirectory: './',
  // coveragePathIgnorePatterns: ['/node_modules/', '__test__/'],
  // coverageReporters: ['json-summary'],
  // reporters: [
  //   'default',
  //   [
  //     'jest-junit',
  //     {
  //       suiteName: 'jest tests',
  //       outputDirectory: '.',
  //       outputName: 'junit.xml',
  //       uniqueOutputName: 'false',
  //       classNameTemplate: '{filename}',
  //       titleTemplate: '{title}',
  //       suiteNameTemplate: '{filename}',
  //     } as any,
  //   ],
  // ],
}
export default config
