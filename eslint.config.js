import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
// import securityConfig from './eslint.security.config.js'; // TODO: Re-enable after fixing flat config compatibility
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import custom rules
const noHardcodedFundMetrics = require('./eslint-rules/no-hardcoded-fund-metrics.cjs');
const povcSecurityPlugin = require('./tools/eslint-plugin-povc-security/index.cjs');

// Boundary enforcement rules for server/client/shared separation
const boundaryRules = {
  server: {
    'no-restricted-imports': [
      'error',
      {
        patterns: ['client/src/*', '../client/*', '../../client/*'],
      },
    ],
  },
  client: {
    'no-restricted-imports': [
      'error',
      {
        patterns: ['server/*', '../server/*', '../../server/*'],
      },
    ],
  },
};

export default [
  // Security rules
  // securityConfig, // TODO: Re-enable after fixing flat config compatibility
  // Global ignores should be first
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.vite/**',
      '.vercel/**',
      'node_modules/**',
      'build/**',
      // Keep tests linted - removed "tests/**"
      'scripts/**',
      'auto-discovery/**',
      'workers/**',
      'types/**',
      'tools/**',
      '**/*.gen.ts',
      '**/*.d.ts',
      '.next/**',
      'umd/**',
      'lib/**',
      'es6/**',
      '.tscache',
      '.tsbuildinfo*',
      'packages/*/dist/**',
      'packages/*/build/**',
      'ml-service/dist/**',
      'typescript-fix-agents/**',
      'check-db.js',
      'client/rum/**',
      'vitest.config.*.ts',
      'vitest.config.ts',
      // Migrated from .eslintignore (ESLint 9.x compatibility)
      'drizzle.config.ts',
      '*.config.ts',
      '*.config.js',
      'tools/eslint-plugin-rls/dist/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Use dedicated ESLint tsconfig to avoid parsing issues
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        performance: 'readonly',
        // Browser/runtime globals
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Node.js globals
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      react: react,
      'react-hooks': reactHooks,
      'unused-imports': unusedImports,
      custom: {
        rules: {
          'no-hardcoded-fund-metrics': noHardcodedFundMetrics,
        },
      },
      'povc-security': povcSecurityPlugin,
    },
    rules: {
      // Type safety rules - ERROR to prevent new 'any' types
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // Consistent type imports (TS1361 auto-fix)
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: false,
        },
      ],

      // Unused imports and variables
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Custom rules - Unified Metrics Layer enforcement
      'custom/no-hardcoded-fund-metrics': 'error',

      // Existing rules
      'no-console': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../state/useFundStore',
              message: "Use '@/stores/useFundStore' only. The state/ version is deprecated.",
            },
          ],
        },
      ],

      // Prefer modern JavaScript features
      'prefer-const': 'warn',
      'prefer-template': 'warn',
      'prefer-nullish-coalescing': 'off', // Will enable once codebase is ready

      // Prevent object-return selectors without equality functions (prevents infinite loops)
      'no-restricted-syntax': [
        'error',
        {
          // Direct useFundStore usage without equality function - encourage useFundSelector
          selector: "CallExpression[callee.name='useFundStore'][arguments.length=1]",
          message: 'Pass an equality function or use useFundSelector (defaults to shallow).',
        },
        {
          // Direct object literal return without equality
          selector:
            "CallExpression[callee.name='useFundStore'][arguments.0.type='ArrowFunctionExpression'][arguments.0.body.type='ObjectExpression'][arguments.length=1]",
          message:
            'Object-return selectors must pass an equality function (use useFundSelector or provide shallow/Object.is as second argument)',
        },
        {
          // Object return from block statement without equality
          selector:
            "CallExpression[callee.name='useFundStore'][arguments.length=1] > ArrowFunctionExpression > BlockStatement ReturnStatement > ObjectExpression",
          message:
            'Object-return selectors must pass an equality function (use useFundSelector or provide shallow/Object.is as second argument)',
        },
        {
          // Array literal return without equality (also causes identity churn)
          selector:
            "CallExpression[callee.name='useFundStore'][arguments.0.type='ArrowFunctionExpression'][arguments.0.body.type='ArrayExpression'][arguments.length=1]",
          message:
            'Array-return selectors must pass an equality function (use useFundSelector or provide shallow as second argument)',
        },
      ],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  // Server boundary enforcement
  {
    files: ['server/**/*.ts', 'server/**/*.js'],
    rules: {
      ...boundaryRules.server,
    },
  },
  // Client boundary enforcement
  {
    files: ['client/**/*.ts', 'client/**/*.tsx', 'client/**/*.js', 'client/**/*.jsx'],
    rules: {
      ...boundaryRules.client,
    },
  },
  // Root-level JavaScript files (orchestrate.js, etc.)
  {
    files: ['*.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        global: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  // API and server files with proper tsconfig
  {
    files: ['api/**/*.ts', 'api/**/*.js', 'server/**/*.ts', 'server/**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.server.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  // Test files with Vitest globals
  {
    files: [
      'tests/**/*.ts',
      'tests/**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    languageOptions: {
      globals: {
        // Vitest test globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        // Node.js test environment
        global: 'readonly',
      },
    },
  },
  // AI and core reserves - deterministic math enforcement
  {
    files: ['ai/**/*.ts', 'ai/**/*.tsx', 'core/reserves/**/*.ts', 'core/reserves/**/*.tsx'],
    rules: {
      'povc-security/no-floating-point-in-core': 'error',
    },
  },
];
