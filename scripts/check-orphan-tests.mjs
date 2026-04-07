#!/usr/bin/env node

const ORPHAN_PATTERN = /(?:^|\/)__tests__\/.*\.(test|spec)\.(ts|tsx|js|jsx)$/;
const ALLOWED_ROOTS = [
  /^packages\/[^/]+\/src\//,
  /^archive\//,
  /^docs\//,
  /^node_modules\//,
];

function normalizePath(filePath) {
  return filePath.startsWith("./") ? filePath.slice(2) : filePath;
}

function isAllowedRoot(filePath) {
  return ALLOWED_ROOTS.some((pattern) => pattern.test(filePath));
}

function isOrphanTest(filePath) {
  return ORPHAN_PATTERN.test(filePath) && !isAllowedRoot(filePath);
}

const inputPaths = process.argv.slice(2).map(normalizePath).filter(Boolean);
const orphanPaths = inputPaths.filter(isOrphanTest);

if (orphanPaths.length === 0) {
  process.exit(0);
}

console.error("REFL-036 orphan test discovery gate failed.");
console.error(
  "Test files in __tests__ directories outside allowed roots are silently skipped by the root vitest config."
);
console.error("Offending paths:");
for (const filePath of orphanPaths) {
  console.error(`  ${filePath}`);
}
console.error(
  "Remediation: move each file to tests/unit/<name>.test.ts for server-only Node tests or tests/unit/<name>.test.tsx for client/jsdom tests including React components."
);

process.exit(1);
