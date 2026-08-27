import { Buffer } from 'node:buffer';
import process from 'node:process';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

export const DOCS_ONLY_CLASSIFICATION = 'docs-only-skip';
export const FULL_RUN_CLASSIFICATION = 'full-run';
export const NO_CHANGES_CLASSIFICATION = 'no-changes';
export const TARGETED_CLASSIFICATION = 'targeted';

export const DOCS_ONLY_PATTERNS = [/^docs\//, /\.mdx?$/i, /^\.gitignore$/];
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
export const VENDORED_SKILL_LOCK_PATTERNS = [/^\.agents\/skills\//, /^skills-lock\.json$/];
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

function normalizeChangedFiles(changedFiles) {
  return changedFiles.filter((file) => typeof file === 'string' && file.length > 0);
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

export function requiresVendoredSkillLockCheck(changedFiles) {
  return normalizeChangedFiles(changedFiles).some((file) =>
    matchesAny(file, VENDORED_SKILL_LOCK_PATTERNS)
  );
}

export function parseChangedFiles(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length === 0) return [];
  if (bytes.at(-1) !== 0) {
    throw new Error('changed-file input must be NUL-terminated');
  }

  const files = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index > start) files.push(utf8Decoder.decode(bytes.subarray(start, index)));
    start = index + 1;
  }
  return files;
}

async function main() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks);
  const classification = classifyChangedFiles(parseChangedFiles(input));
  process.stdout.write(`${classification}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
