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
      ".vercel/**",
      "node_modules/**",
      "build/**",
      // Keep tests linted - removed "tests/**"
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
      "typescript-fix-agents/**",
      "check-db.js",
      "client/rum/**"
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
      // These require parserOptions.project which impacts performance
      // "@typescript-eslint/no-unsafe-assignment": "warn",
      // "@typescript-eslint/no-unsafe-member-access": "warn",
      // "@typescript-eslint/no-unsafe-call": "warn",
      // "@typescript-eslint/no-unsafe-return": "warn",
      
      // Existing rules
      "@typescript-eslint/no-unused-vars": "off", 
      "no-console": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      
      // Prefer modern JavaScript features
      "prefer-const": "warn",
      "prefer-template": "warn",
      "prefer-nullish-coalescing": "off", // Will enable once codebase is ready
      
      // Prevent object-return selectors without equality functions (prevents infinite loops)
      "no-restricted-syntax": [
        "error",
        {
          // Direct useFundStore usage without equality function - encourage useFundSelector
          "selector": "CallExpression[callee.name='useFundStore'][arguments.length=1]",
          "message": "Pass an equality function or use useFundSelector (defaults to shallow)."
        },
        {
          // Direct object literal return without equality
          "selector": "CallExpression[callee.name='useFundStore'][arguments.0.type='ArrowFunctionExpression'][arguments.0.body.type='ObjectExpression'][arguments.length=1]",
          "message": "Object-return selectors must pass an equality function (use useFundSelector or provide shallow/Object.is as second argument)"
        },
        {
          // Object return from block statement without equality
          "selector": "CallExpression[callee.name='useFundStore'][arguments.length=1] > ArrowFunctionExpression > BlockStatement ReturnStatement > ObjectExpression",
          "message": "Object-return selectors must pass an equality function (use useFundSelector or provide shallow/Object.is as second argument)"
        },
        {
          // Array literal return without equality (also causes identity churn)
          "selector": "CallExpression[callee.name='useFundStore'][arguments.0.type='ArrowFunctionExpression'][arguments.0.body.type='ArrayExpression'][arguments.length=1]",
          "message": "Array-return selectors must pass an equality function (use useFundSelector or provide shallow as second argument)"
        }
      ]
    },
    settings: { 
      react: { version: "detect" } 
    }
  }
];