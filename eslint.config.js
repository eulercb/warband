// Warband — ESLint 10 flat config using typescript-eslint's non-type-checked
// recommended preset (fast; no full type info needed). `tsc --noEmit` in
// `npm run build` is the real correctness gate; this catches lint-level issues.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Programmatic Pixi/DOM code occasionally needs pragmatic casts.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Scripts mix Node and, inside page.evaluate callbacks, browser globals.
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
