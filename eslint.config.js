import rlsPlugin from './tools/eslint-plugin-rls/index.js';

export default [
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "tests/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "scripts/**",
      "auto-discovery/**",
      "check-db.js",
      "workers/**",
      "types/**",
      "tools/**"
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off"
    }
  },
  {
    files: ["server/routes/**/*.ts", "server/routes/**/*.js"],
    plugins: {
      rls: rlsPlugin
    },
    rules: {
      "rls/enforce-rls-transaction": "error"
    }
  }
];
