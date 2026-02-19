import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import angular from '@analogjs/vite-plugin-angular'

export default defineConfig({
  plugins: [angular()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../backend/src/shared', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.vitest.spec.ts', 'src/**/*.spec.ts'],
    exclude: [
      'node_modules',
      // Old component tests that use new Component() directly (incompatible with Analog plugin).
      // These are replaced by *.vitest.spec.ts TestBed-based tests.
      'src/app/modbus-error/modbus-error.component.spec.ts',
      'src/app/select-slave/select-slave.component.spec.ts',
      'src/app/specification/entity/entity.component.spec.ts',
      'src/app/specification/hexinputfield/hexinputfield.test.component.spec.ts',
    ],
  },
})
