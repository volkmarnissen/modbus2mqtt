import vitestPlugin from 'eslint-plugin-vitest'
import prettierConfig from 'eslint-config-prettier'

export default [
  { ignores: ['../dist/**', 'dist/**'] },
  {
    files: ['tests/**/*.{ts,tsx,mts}'],
    plugins: { vitest: vitestPlugin },
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
      'vitest/expect-expect': 'warn',
      'vitest/no-identical-title': 'error',
    },
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
  },
  { ...prettierConfig },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx'],
    ignores: ['vitest.config.*', 'vite.config.*', 'eslint.config.*'],
    languageOptions: {
      parser: (await import('@typescript-eslint/parser')).default,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.eslint.json',
      },
    },
    plugins: {
      '@typescript-eslint': (await import('@typescript-eslint/eslint-plugin')).default,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
]
