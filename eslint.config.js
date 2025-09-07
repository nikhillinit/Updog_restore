import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Boundary enforcement rules for server/client/shared separation
const boundaryRules = {
  server: {
    "no-restricted-imports": ["error", {
      patterns: [
        "client/src/*",
        "../client/*",
        "../../client/*"
      ],
      message: "Server code cannot import from client"
    }]
  },
  client: {
    "no-restricted-imports": ["error", {
      patterns: [
        "server/*",
        "../server/*",
        "../../server/*"
      ],
      message: "Client code cannot import from server"
    }]
  }
};

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
      "check-db.js",
      "client/rum/**",
      "vitest.config.*.ts",
      "vitest.config.ts"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Use dedicated ESLint tsconfig to avoid parsing issues
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
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
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      
      // Existing rules
      "@typescript-eslint/no-unused-vars": "off", 
      "no-console": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": ["error", {
        "paths": [{
          "name": "../state/useFundStore",
          "message": "Use '@/stores/useFundStore' only. The state/ version is deprecated."
        }]
      }],
      
      // Prefer modern JavaScript features
      "prefer-const": "warn",
      "prefer-template": "warn",
      "prefer-nullish-coalescing": "off" // Will enable once codebase is ready
    },
    settings: { 
      react: { version: "detect" } 
    }
  },
  // Server boundary enforcement
  {
    files: ["server/**/*.ts", "server/**/*.js"],
    rules: boundaryRules.server
  },
  // Client boundary enforcement
  {
    files: ["client/**/*.ts", "client/**/*.tsx", "client/**/*.js", "client/**/*.jsx"],
    rules: boundaryRules.client
  }
];