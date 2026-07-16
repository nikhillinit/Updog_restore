#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAN_VERSION = 1;
const DEFAULT_BASE_REF = process.env.BASE_REF || 'origin/main';
const DEFAULT_PLAN_PATH = 'artifacts/affected-plan.json';
const MAX_CHANGED_FILES = 200;
const MAX_SELECTED_TESTS = 100;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i;
const BROAD_IMPACT_PATTERNS = [
  /^(?:shared|migrations|scripts)\//,
  /^\.github\//,
  /^(?:package(?:-lock)?\.json|tsconfig[^/]*\.json|vite\.config\.|vitest\.config\.)/,
  /^Dockerfile/,
];

function normalizeRepoPath(value) {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function isDocumentationPath(value) {
  return /\.(?:md|mdx|txt)$/i.test(value) || value.startsWith('docs/');
}

function isBroadImpactPath(value) {
  return BROAD_IMPACT_PATTERNS.some((pattern) => pattern.test(value));
}

function pathStem(value) {
  return normalizeRepoPath(value)
    .replace(/\.(?:[cm]?[jt]sx?)$/i, '')
    .replace(/\/index$/i, '');
}

function resolveImportStem(testPath, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  if (cleanSpecifier.startsWith('@/')) {
    return pathStem(`client/src/${cleanSpecifier.slice(2)}`);
  }
  if (cleanSpecifier.startsWith('@shared/')) {
    return pathStem(`shared/${cleanSpecifier.slice('@shared/'.length)}`);
  }
  if (!cleanSpecifier.startsWith('.')) {
    return undefined;
  }
  return pathStem(
    path.posix.normalize(path.posix.join(path.posix.dirname(testPath), cleanSpecifier))
  );
}

function extractImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

async function walkTestFiles(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relativePath = normalizeRepoPath(path.join(relativeDirectory, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await walkTestFiles(root, relativePath)));
    } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      files.push(relativePath);
    }
  }
  return files;
}

async function findDirectlyAffectedTests(root, changedFiles) {
  const changesByStem = new Map();
  for (const changedFile of changedFiles) {
    const stem = pathStem(changedFile);
    const files = changesByStem.get(stem) ?? [];
    files.push(changedFile);
    changesByStem.set(stem, files);
  }
  const selected = new Set(
    changedFiles.filter((file) => TEST_FILE_PATTERN.test(file) && existsSync(path.join(root, file)))
  );
  const mappedChanges = new Set(selected);
  const testFiles = (
    await Promise.all(
      ['tests/unit', 'tests/perf', 'tests/regressions'].map((directory) =>
        walkTestFiles(root, directory)
      )
    )
  ).flat();

  for (const testFile of testFiles) {
    if (selected.has(testFile)) {
      continue;
    }
    const source = await readFile(path.join(root, testFile), 'utf8');
    let importsChangedFile = false;
    for (const specifier of extractImportSpecifiers(source)) {
      const importStem = resolveImportStem(testFile, specifier);
      const importedChanges = importStem === undefined ? undefined : changesByStem.get(importStem);
      if (importedChanges === undefined) {
        continue;
      }
      importsChangedFile = true;
      for (const changedFile of importedChanges) {
        mappedChanges.add(changedFile);
      }
    }
    if (importsChangedFile) {
      selected.add(testFile);
    }
  }

  return {
    tests: [...selected].sort(),
    mappedChanges,
  };
}

export async function createAffectedTestPlan({
  root = process.cwd(),
  changedFiles,
  baseSha,
  headSha,
  maxFiles = MAX_CHANGED_FILES,
} = {}) {
  if (!Array.isArray(changedFiles)) {
    throw new Error('changedFiles must be an array');
  }
  const normalizedChanges = [
    ...new Set(changedFiles.map(normalizeRepoPath).filter(Boolean)),
  ].sort();
  const metadata = {
    version: PLAN_VERSION,
    baseSha,
    headSha,
  };

  if (normalizedChanges.length === 0 || normalizedChanges.every(isDocumentationPath)) {
    return {
      ...metadata,
      mode: 'no_affected_tests',
      tests: [],
      reason:
        normalizedChanges.length === 0
          ? 'The diff contains no changed files.'
          : 'The diff contains documentation only.',
    };
  }

  if (normalizedChanges.length > maxFiles) {
    return {
      ...metadata,
      mode: 'full_fallback',
      tests: [],
      reason: `The diff contains ${normalizedChanges.length} files, above the ${maxFiles}-file selection limit.`,
    };
  }

  const broadImpactFile = normalizedChanges.find(isBroadImpactPath);
  if (broadImpactFile !== undefined) {
    return {
      ...metadata,
      mode: 'full_fallback',
      tests: [],
      reason: `Broad-impact change requires the full unit suite: ${broadImpactFile}`,
    };
  }

  const { tests: selectedTests, mappedChanges } = await findDirectlyAffectedTests(
    root,
    normalizedChanges
  );
  const uncoveredChange = normalizedChanges.find(
    (changedFile) => !isDocumentationPath(changedFile) && !mappedChanges.has(changedFile)
  );
  if (uncoveredChange !== undefined) {
    return {
      ...metadata,
      mode: 'full_fallback',
      tests: [],
      reason: `No direct test mapping was proven for ${uncoveredChange}; fail closed to the full unit suite.`,
    };
  }
  if (selectedTests.length === 0 || selectedTests.length > MAX_SELECTED_TESTS) {
    return {
      ...metadata,
      mode: 'full_fallback',
      tests: [],
      reason:
        selectedTests.length === 0
          ? 'No direct test mapping was proven; fail closed to the full unit suite.'
          : `Selection produced ${selectedTests.length} tests, above the ${MAX_SELECTED_TESTS}-test limit.`,
    };
  }

  return {
    ...metadata,
    mode: 'selected',
    tests: selectedTests,
    reason: 'Selected existing tests that changed directly or import a changed source file.',
  };
}

export async function validateAffectedTestPlan(plan, { root = process.cwd() } = {}) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Affected test plan must be an object.');
  }
  if (plan.version !== PLAN_VERSION) {
    throw new Error(`Unsupported affected test plan version: ${String(plan.version)}`);
  }
  if (!['selected', 'no_affected_tests', 'full_fallback'].includes(plan.mode)) {
    throw new Error(`Unsupported affected test plan mode: ${String(plan.mode)}`);
  }
  if (typeof plan.reason !== 'string' || plan.reason.trim() === '') {
    throw new Error('Affected test plan requires a reason.');
  }
  if (!Array.isArray(plan.tests) || !plan.tests.every((test) => typeof test === 'string')) {
    throw new Error('Affected test plan tests must be an array of strings.');
  }
  if (plan.mode !== 'selected' && plan.tests.length !== 0) {
    throw new Error(`${plan.mode} plans must not contain selected tests.`);
  }
  if (plan.mode === 'selected' && plan.tests.length === 0) {
    throw new Error('Selected plans must contain at least one test.');
  }

  for (const test of plan.tests) {
    const normalized = normalizeRepoPath(test);
    if (
      normalized !== test ||
      path.isAbsolute(test) ||
      normalized.split('/').includes('..') ||
      !TEST_FILE_PATTERN.test(normalized)
    ) {
      throw new Error(`Invalid selected test path: ${test}`);
    }
    const absolutePath = path.resolve(root, normalized);
    const relativeToRoot = path.relative(path.resolve(root), absolutePath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new Error(`Selected test escapes the repository: ${test}`);
    }
    let selectedStat;
    try {
      selectedStat = await stat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Selected test does not exist: ${test}`);
      }
      throw error;
    }
    if (!selectedStat.isFile()) {
      throw new Error(`Selected test does not exist: ${test}`);
    }
  }

  return plan;
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpm(args, { root = process.cwd(), spawn = spawnSync } = {}) {
  const result = spawn(npmExecutable(), args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  return typeof result.status === 'number' ? result.status : 1;
}

function isIntegrationTestPath(testPath) {
  return testPath.startsWith('tests/integration/') || testPath.startsWith('tests/api/');
}

function isUnitTestPath(testPath) {
  return (
    testPath.startsWith('tests/unit/') ||
    testPath.startsWith('tests/perf/') ||
    testPath.startsWith('tests/regressions/')
  );
}

export async function executeSelectedPlan(plan, { root = process.cwd(), spawn = spawnSync } = {}) {
  await validateAffectedTestPlan(plan, { root });
  if (plan.mode !== 'selected') {
    throw new Error(`Cannot execute selected tests for plan mode ${plan.mode}.`);
  }

  const unsupportedTest = plan.tests.find(
    (test) => !isUnitTestPath(test) && !isIntegrationTestPath(test)
  );
  if (unsupportedTest !== undefined) {
    throw new Error(`No affected-test runner is configured for ${unsupportedTest}.`);
  }

  const integrationTests = plan.tests.filter(isIntegrationTestPath);
  const unitTests = plan.tests.filter(isUnitTestPath);
  for (const [script, tests] of [
    ['test:unit', unitTests],
    ['test:integration', integrationTests],
  ]) {
    if (tests.length === 0) {
      continue;
    }
    const status = runNpm(['run', script, '--', ...tests], { root, spawn });
    if (status !== 0) {
      return status;
    }
  }
  return 0;
}

function gitOutput(args, root) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function createPlanFromGit(root, baseRef) {
  const baseSha = gitOutput(['rev-parse', baseRef], root);
  const headSha = gitOutput(['rev-parse', 'HEAD'], root);
  const committedDiff = gitOutput(['diff', '--name-only', `${baseSha}...${headSha}`], root);
  const workingDiff = gitOutput(['diff', '--name-only', 'HEAD'], root);
  const untracked = gitOutput(['ls-files', '--others', '--exclude-standard'], root);
  const changedFiles = [committedDiff, workingDiff, untracked]
    .filter(Boolean)
    .flatMap((output) => output.split(/\r?\n/));
  return createAffectedTestPlan({ root, changedFiles, baseSha, headSha });
}

async function writePlan(planPath, plan, root) {
  const absolutePath = path.resolve(root, planPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, absolutePath);
}

async function readPlan(planPath, root) {
  const source = await readFile(path.resolve(root, planPath), 'utf8');
  return JSON.parse(source);
}

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline !== undefined) {
    return inline.slice(prefix.length);
  }
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args = process.argv.slice(2), root = process.cwd()) {
  const planPath = argumentValue(args, '--plan-json');
  const runPlanPath = argumentValue(args, '--run-plan');
  const baseRef = argumentValue(args, '--base-ref') || DEFAULT_BASE_REF;

  if (planPath !== undefined && runPlanPath !== undefined) {
    throw new Error('--plan-json and --run-plan are mutually exclusive.');
  }

  if (runPlanPath !== undefined) {
    const plan = await readPlan(runPlanPath, root);
    await validateAffectedTestPlan(plan, { root });
    const currentHead = gitOutput(['rev-parse', 'HEAD'], root);
    if (typeof plan.headSha === 'string' && plan.headSha !== currentHead) {
      throw new Error(
        `Affected test plan is stale: planned ${plan.headSha}, current ${currentHead}.`
      );
    }
    process.exitCode = await executeSelectedPlan(plan, { root });
    return;
  }

  const plan = await createPlanFromGit(root, baseRef);
  if (planPath !== undefined) {
    await writePlan(planPath || DEFAULT_PLAN_PATH, plan, root);
    console.log(`[PLAN] ${plan.mode}: ${plan.reason}`);
    return;
  }

  if (args.includes('--list-only')) {
    console.log(plan.mode === 'selected' ? plan.tests.join(',') : plan.mode);
    return;
  }

  console.log(`[PLAN] ${plan.mode}: ${plan.reason}`);
  if (plan.mode === 'selected') {
    process.exitCode = await executeSelectedPlan(plan, { root });
  } else if (plan.mode === 'no_affected_tests') {
    process.exitCode = runNpm(['run', 'validate:core'], { root });
  } else {
    process.exitCode = runNpm(['run', 'test:unit'], { root });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath.toLowerCase() === modulePath.toLowerCase()) {
  main().catch((error) => {
    console.error(`[FAIL] Affected test planning or execution failed: ${error.message}`);
    process.exitCode = 1;
  });
}
