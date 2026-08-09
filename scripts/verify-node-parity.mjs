#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NODE_VERSION = '22.23.2';
export const NODE_ENGINE = '22.x';
export const DOCKER_BASE_IMAGE =
  'node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');
const WORKFLOW_DIR = join('.github', 'workflows');
const NODE_SETUP_ACTION = join('.github', 'actions', 'setup-node-env', 'action.yml');
const DOCKER_FILES = ['Dockerfile', 'Dockerfile.railway', 'Dockerfile.worker'];
const BUILD_SCRIPTS = [
  'scripts/build-server.mjs',
  'scripts/build-vercel-api.mjs',
  'scripts/build-workers.mjs',
];

function addMismatch(mismatches, surface, expected, actual) {
  if (expected === actual) return;
  mismatches.push(`${surface}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function readText(rootDir, relativePath, mismatches) {
  const filePath = join(rootDir, relativePath);
  if (!existsSync(filePath)) {
    mismatches.push(`${relativePath}: file is missing`);
    return null;
  }

  return readFileSync(filePath, 'utf8');
}

function checkPackageJson(rootDir, mismatches) {
  const text = readText(rootDir, 'package.json', mismatches);
  if (text === null) return;

  let packageJson;
  try {
    packageJson = JSON.parse(text);
  } catch (error) {
    mismatches.push(`package.json: invalid JSON (${error.message})`);
    return;
  }

  addMismatch(mismatches, 'package.json engines.node', NODE_ENGINE, packageJson.engines?.node);
  addMismatch(mismatches, 'package.json volta.node', NODE_VERSION, packageJson.volta?.node);
}

function checkWorkflowFile(relativePath, text, mismatches) {
  const nodeVersionPins = [
    ...text.matchAll(/^\s*node-version:\s*["']?([^\s"']+)["']?\s*$/gm),
  ];

  if (/uses:\s*actions\/setup-node@/m.test(text) && nodeVersionPins.length === 0) {
    mismatches.push(`${relativePath}: setup-node is missing a node-version pin`);
  }

  for (const [index, match] of nodeVersionPins.entries()) {
    addMismatch(
      mismatches,
      `${relativePath} node-version[${index + 1}]`,
      NODE_VERSION,
      match[1]
    );
  }

  for (const [index, match] of [...text.matchAll(/node -v[^\n]*v(\d+\.\d+\.\d+)/g)].entries()) {
    addMismatch(
      mismatches,
      `${relativePath} node -v assertion[${index + 1}]`,
      NODE_VERSION,
      match[1]
    );
  }
}

function checkWorkflows(rootDir, mismatches) {
  const workflowDir = join(rootDir, WORKFLOW_DIR);
  if (!existsSync(workflowDir)) {
    mismatches.push(`${WORKFLOW_DIR}: directory is missing`);
    return;
  }

  const workflowFiles = readdirSync(workflowDir)
    .filter((fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
    .sort();

  for (const fileName of workflowFiles) {
    const relativePath = join(WORKFLOW_DIR, fileName);
    const text = readText(rootDir, relativePath, mismatches);
    if (text !== null) checkWorkflowFile(relativePath, text, mismatches);
  }

  const actionText = readText(rootDir, NODE_SETUP_ACTION, mismatches);
  if (actionText !== null) {
    const defaultVersion = actionText.match(/^\s*default:\s*["']([^"']+)["']\s*$/m)?.[1];
    addMismatch(mismatches, `${NODE_SETUP_ACTION} default`, NODE_VERSION, defaultVersion);
  }
}

function checkDockerFiles(rootDir, mismatches) {
  for (const relativePath of DOCKER_FILES) {
    const text = readText(rootDir, relativePath, mismatches);
    if (text === null) continue;

    const fromLines = [...text.matchAll(/^\s*FROM\s+(\S+)/gm)];
    if (fromLines.length === 0) {
      mismatches.push(`${relativePath}: no FROM line found`);
      continue;
    }

    for (const [index, match] of fromLines.entries()) {
      addMismatch(
        mismatches,
        `${relativePath} FROM[${index + 1}]`,
        DOCKER_BASE_IMAGE,
        match[1]
      );
    }
  }
}

function checkBuildScripts(rootDir, mismatches) {
  for (const relativePath of BUILD_SCRIPTS) {
    const text = readText(rootDir, relativePath, mismatches);
    if (text === null) continue;

    const targets = [...text.matchAll(/^\s*target:\s*["']([^"']+)["']\s*,?\s*$/gm)];
    if (targets.length === 0) {
      mismatches.push(`${relativePath}: no esbuild target found`);
      continue;
    }

    for (const [index, match] of targets.entries()) {
      addMismatch(mismatches, `${relativePath} esbuild target[${index + 1}]`, 'node22', match[1]);
    }
  }
}

export function findNodeParityMismatches(rootDir = DEFAULT_ROOT) {
  const mismatches = [];
  checkPackageJson(rootDir, mismatches);

  const nvmrc = readText(rootDir, '.nvmrc', mismatches);
  if (nvmrc !== null) addMismatch(mismatches, '.nvmrc', NODE_VERSION, nvmrc.trim());

  checkWorkflows(rootDir, mismatches);
  checkDockerFiles(rootDir, mismatches);
  checkBuildScripts(rootDir, mismatches);

  return mismatches;
}

export function runNodeParityCheck({
  rootDir = DEFAULT_ROOT,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const mismatches = findNodeParityMismatches(rootDir);
  if (mismatches.length === 0) {
    stdout(`[node-parity] pass: all controlled surfaces use Node ${NODE_VERSION}`);
    return 0;
  }

  stderr(`[node-parity] failed: ${mismatches.length} drift(s) detected`);
  for (const mismatch of mismatches) stderr(`- ${mismatch}`);
  return 1;
}

function getRootDir(argv) {
  const rootIndex = argv.indexOf('--root');
  if (rootIndex === -1) return DEFAULT_ROOT;
  if (!argv[rootIndex + 1]) throw new Error('--root requires a directory path');
  return resolve(argv[rootIndex + 1]);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  process.exitCode = runNodeParityCheck({ rootDir: getRootDir(process.argv.slice(2)) });
}
