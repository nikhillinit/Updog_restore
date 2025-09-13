import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typeAwareFiles = [
  'shared/**/*.{ts,tsx}',
  'server/**/*.{ts,tsx}',
  // keep finance/math & schema guarded
  'client/src/lib/finance/**/*.{ts,tsx}',
  'client/src/lib/waterfall/**/*.{ts,tsx}',
];

export default [
  // Global ignores should be first
  {
    ignores: [
      "dist/**",
      "coverage/**",
      ".vite/**",
      "node_modules/**",
      "build/**",
      "tests/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "scripts/**",
      "auto-discovery/**",
      "workers/**",
      "types/**",
      "tools/**",
      "**/*.gen.ts",
      "**/*.d.ts",
      ".next/**",
      "umd/**",
      "lib/**",
      "es6/**",
      ".tscache",
      ".tsbuildinfo*",
      "packages/*/dist/**",
      "packages/*/build/**",
      "ml-service/dist/**"
    ]
  },
  js.configs.recommended,

  // Tier A: Fast lint (no type info) across the repo
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        crypto: "readonly",
        __dirname: "readonly",
        require: "readonly",
        performance: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": ts,
      "react": react,
      "react-hooks": reactHooks
    },
    rules: {
      // Basic hygiene rules (no type info needed)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "prefer-const": "warn",
      "prefer-template": "warn"
    },
    settings: {
      react: { version: "detect" }
    }
  },

  // Tier B: Type-aware lint on critical paths
  {
    files: typeAwareFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: __dirname,
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      "@typescript-eslint": ts
    },
    rules: {
      // Keep high-signal safety rules ON where it matters
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn"
    }
  }
];