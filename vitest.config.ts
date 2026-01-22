import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['backend/tests/**/*_test.ts?(x)'],
    exclude: ['backend/tests/**/testhelper.ts', 'backend/tests/**/configsbase.ts', 'backend/tests/setup/**'],
    hookTimeout: 30000,
    setupFiles: ['backend/tests/setup/vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@jest/globals': (() => {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = dirname(__filename)
        return resolve(__dirname, 'backend/tests/setup/jest-globals-shim.ts')
      })(),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
})
