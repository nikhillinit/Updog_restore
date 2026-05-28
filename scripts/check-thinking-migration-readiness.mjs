#!/usr/bin/env node

console.error(
  '[check-thinking-migration-readiness] Retired: local agent package migration checks are no longer wired into app tooling.'
);
console.error('Use the Batch 8 package deletion or externalization plan before changing local agent package directories.');
process.exit(1);
