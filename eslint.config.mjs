import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import jest from 'eslint-plugin-jest'
import prettierPlugin from 'eslint-plugin-prettier'
import unusedImportsPlugin from 'eslint-plugin-unused-imports'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['dist/**', 'jest.config.ts', 'jest.config.cjs'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      jest,
      prettier: prettierPlugin,
      'unused-imports': unusedImportsPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
        project: ['tsconfig.eslint.json'],
      },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      'prettier/prettier': 'error',
      // Prefer plugin rule for unused imports/vars
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['tsconfig.eslint.json', 'tsconfig.angular.json'],
        },
      },
    },
  },
  {
    files: ['__tests__/**/*.ts', '__tests__/**/*.tsx', '__tests__/**/*.js'],
    rules: {
      // Relax strict TS/Jest rules in tests to reduce noise
      'unused-imports/no-unused-imports': 'off',
      'unused-imports/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-shadow-restricted-names': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-case-declarations': 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
        project: ['tsconfig.eslint.json'],
      },
    },
  },
  {
    ignores: ['*.js', '*.mjs'],
  },
]
