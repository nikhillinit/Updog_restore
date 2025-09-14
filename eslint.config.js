import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      "ml-service/dist/**",
      "drizzle.config.ts",
      "*.config.ts",
      "*.config.js",
      "**/*.config.ts",
      "**/*.config.js",
      "playwright.config*.ts",
      "vitest.config*.ts",
      "vite.config*.ts",
      "tailwind.config*.ts"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Remove project references for performance
        // project: ["./client/tsconfig.json", "./server/tsconfig.json"],
        // tsconfigRootDir: __dirname,
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
      // Phase 1: Type safety warnings (will escalate to errors in Phase 3)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      
      // Existing rules
      "@typescript-eslint/no-unused-vars": "off", 
      "no-console": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      
      // Prefer modern JavaScript features
      "prefer-const": "warn",
      "prefer-template": "warn",
      "prefer-nullish-coalescing": "off" // Will enable once codebase is ready
    },
    settings: { 
      react: { version: "detect" } 
    }
  }
];