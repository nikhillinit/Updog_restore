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
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
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
      "tools/**"
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./client/tsconfig.json", "./server/tsconfig.json"],
        tsconfigRootDir: __dirname,
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { 
      "@typescript-eslint": ts, 
      "react": react, 
      "react-hooks": reactHooks 
    },
    rules: {
      // Keep minimal rules for now - add gradually once green
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off", 
      "no-console": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    },
    settings: { 
      react: { version: "detect" } 
    }
  }
];