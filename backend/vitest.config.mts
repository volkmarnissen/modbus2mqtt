import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, 'src'),
      '@tests': path.resolve(__dirname, 'tests'),
      '@jest/globals': path.resolve(__dirname, 'tests/setup/jest-globals-shim.ts'),
    },
  },
  esbuild: {
    sourcemap: 'inline',
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*_test.ts?(x)', 'tests/**/*.test.ts?(x)'],
    exclude: ['tests/**/testhelper.ts', 'tests/**/configsbase.ts', 'tests/setup/**'],
    hookTimeout: 30000,
    setupFiles: ['tests/setup/vitest.setup.ts'],
  },
})
