import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOCS_ONLY_CLASSIFICATION = 'docs-only-skip';
export const FULL_RUN_CLASSIFICATION = 'full-run';
export const NO_CHANGES_CLASSIFICATION = 'no-changes';
export const TARGETED_CLASSIFICATION = 'targeted';

export const DOCS_ONLY_PATTERNS = [
  /^docs\//,
  /\.mdx?$/i,
  /^\.gitignore$/,
];
export const FULL_RUN_PATTERNS = [
  /^package(?:-lock)?\.json$/,
  /^tsconfig(?:\.[^/]+)?\.json$/,
  /^(?:vite|vitest)\.config\.[^/]+$/,
  /^\.github\/(?:actions|workflows)\//,
  /^\.github\/path-filters\.ya?ml$/,
  /^Dockerfile(?:\..+)?$/,
  /^docker-compose(?:\.[^/]+)?\.ya?ml$/,
  /^scripts\/(?:test-smart|pre-push|pre-push-classification|typescript-baseline)\.(?:mjs|cjs)$/,
];

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map((file) => file.trim()).filter(Boolean);
}

export function classifyChangedFiles(changedFiles) {
  const files = normalizeChangedFiles(changedFiles);

  if (files.length === 0) {
    return NO_CHANGES_CLASSIFICATION;
  }

  if (files.every((file) => matchesAny(file, DOCS_ONLY_PATTERNS))) {
    return DOCS_ONLY_CLASSIFICATION;
  }

  if (files.some((file) => matchesAny(file, FULL_RUN_PATTERNS))) {
    return FULL_RUN_CLASSIFICATION;
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
