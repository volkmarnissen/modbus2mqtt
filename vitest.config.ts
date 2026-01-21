import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*_test.ts?(x)'],
    exclude: ['__tests__/**/testhelper.ts', '__tests__/**/configsbase.ts', '__tests__/setup/**'],
    hookTimeout: 30000,
    setupFiles: ['__tests__/setup/vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@jest/globals': (() => {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = dirname(__filename)
        return resolve(__dirname, '__tests__/setup/jest-globals-shim.ts')
      })(),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
})
