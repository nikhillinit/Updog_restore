import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOCS_ONLY_CLASSIFICATION = 'docs-only-skip';
export const FULL_RUN_CLASSIFICATION = 'full-run';
export const NO_CHANGES_CLASSIFICATION = 'no-changes';
export const TARGETED_CLASSIFICATION = 'targeted';
export const TYPE_FIX_ONLY_CLASSIFICATION = 'type-fix-only-skip';

export const NON_TEST_IMPACTING_PATTERN =
  /^(docs\/|.*\.md$|.*\.ya?ml$|.*\.toml$|.*\.gitignore$|CLAUDE\.md$)/;
export const FULL_RUN_PATTERN =
  /(vitest\.config\.ts|vite\.config\.ts|tsconfig\.json|package\.json|package-lock\.json)/;
export const TYPE_FIX_ONLY_PATTERN = /(ErrorBoundary|LoadingState|CHANGELOG)/;

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map((file) => file.trim()).filter(Boolean);
}

export function classifyChangedFiles(changedFiles) {
  const files = normalizeChangedFiles(changedFiles);

  if (files.length === 0) {
    return NO_CHANGES_CLASSIFICATION;
  }

  if (files.every((file) => NON_TEST_IMPACTING_PATTERN.test(file))) {
    return DOCS_ONLY_CLASSIFICATION;
  }

  if (files.some((file) => FULL_RUN_PATTERN.test(file))) {
    return FULL_RUN_CLASSIFICATION;
  }

  if (files.some((file) => TYPE_FIX_ONLY_PATTERN.test(file))) {
    return TYPE_FIX_ONLY_CLASSIFICATION;
  }

  return TARGETED_CLASSIFICATION;
}

export function parseChangedFiles(input) {
  return input.split(/\r?\n/).filter(Boolean);
}

async function main() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks).toString('utf8');
  const classification = classifyChangedFiles(parseChangedFiles(input));
  process.stdout.write(`${classification}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
