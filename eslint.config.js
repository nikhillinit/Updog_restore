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
      "types/**"
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off"
    }
  }
];
