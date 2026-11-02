// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['src/inbound/adapters/**/*.ts', 'src/inbound/**/*normalizer*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@omnidesk/domain',
              message:
                'Provider adapters normalize data; application ingestion owns domain decisions.',
            },
            {
              name: '@prisma/client',
              message:
                'Provider adapters use the internal normalization contract, not Prisma.',
            },
            {
              name: '@omnidesk/shared',
              importNames: ['calculateSlaDueAt', 'getSlaHours'],
              message: 'SLA belongs to ingestion policy.',
            },
          ],
          patterns: [
            {
              group: ['**/database/**', '**/ingestion/**', '**/realtime/**'],
              message:
                'Provider normalization must not depend on domain persistence, policy or realtime.',
            },
          ],
        },
      ],
    },
  },
);
