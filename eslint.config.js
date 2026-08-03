import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'graphify-out/**', 'apps/web/dist/**'],
  },
  {
    files: ['apps/web/src/components/**/*.{ts,tsx}', 'apps/web/src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@monopoly-deal/engine',
              message: 'Components must use the store adapter, not the engine directly.',
            },
          ],
          patterns: [
            {
              group: ['**/networkAdapter', '**/localAdapter'],
              message: 'Components must not import adapters directly; use the store hook.',
            },
          ],
        },
      ],
    },
  },
);
