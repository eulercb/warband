// Warband — ESLint 10 flat config.
//
// Type-aware linting: typescript-eslint's `recommendedTypeChecked` preset runs
// the full type-informed rule set (no floating/misused promises, no unsafe
// `any`, no needless assertions, …) against the TS/TSX sources. React sources
// additionally get the React Hooks and React Refresh rules. `tsc --noEmit`
// (`npm run typecheck` / `build`) stays the authoritative type gate; ESLint
// catches the lint- and hooks-level issues the compiler doesn't.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**', 'coverage/**'] },

  js.configs.recommended,

  // Type-aware linting, scoped to the TS/TSX sources the tsconfig covers.
  // `projectService` lets typescript-eslint resolve each file's program
  // automatically (no explicit `project` glob to maintain).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
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
      // JSX event-handler attributes routinely take async callbacks; React
      // ignores the returned promise, so `onClick={async …}` is fine. The rule
      // still guards the dangerous cases (an async fn passed where its return
      // value IS consumed — array callbacks, Promise executors, …).
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // React sources: Hooks correctness (rules-of-hooks, exhaustive-deps, and the
  // React-Compiler-era purity/ref/effect rules) plus Fast Refresh safety.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Node scripts, the relay server and config files are plain JS/ESM outside the
  // TS program: no type-aware rules (there's no type info), just Node globals.
  // The `page.evaluate` callbacks in scripts also touch browser globals.
  {
    files: ['scripts/**/*.{js,mjs}', 'server/**/*.{js,mjs}', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
