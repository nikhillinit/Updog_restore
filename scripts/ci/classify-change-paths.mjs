#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const EXACT_LIGHT_ALLOWLIST = [
  'docs/_generated/router-index.json',
  'docs/_generated/router-fast.json',
  'docs/_generated/staleness-report.md',
  'docs/skills/SKILLS_INDEX.md',
  'docs/skills/WIZARD_INDEX.md',
];

const FINANCIAL_PATHS = {
  inclusionRoots: [
    'server/engine/',
    'server/core/',
    'shared/core/',
    'client/src/engines/',
    'client/src/core/',
  ],
  exclusionBasedRoots: [
    { root: 'server/services/', exclusions: [] },
    { root: 'client/src/lib/', exclusions: [] },
    { root: 'shared/schemas/', exclusions: [] },
    { root: 'shared/lib/', exclusions: [] },
    { root: 'shared/contracts/', exclusions: [] },
  ],
  namedPaths: [
    'shared/utils/scenario-math.ts',
    'scripts/golden/',
    'server/lib/moic-mapper.ts',
    'client/src/adapters/reserves-adapter.ts',
    'docs/internal-economics-v2.truth-cases.json',
    'tests/unit/internal-economics/v2/support/',
    'tests/unit/truth-cases/internal-economics-v2-engine.test.ts',
  ],
};

function matchesPath(changedPath, candidate) {
  return changedPath === candidate ||
    changedPath.startsWith(candidate.endsWith('/') ? candidate : `${candidate}/`);
}

export function isFinancialPath(changedPath) {
  if (FINANCIAL_PATHS.inclusionRoots.some((root) => matchesPath(changedPath, root))) {
    return true;
  }

  if (
    FINANCIAL_PATHS.exclusionBasedRoots.some(({ root, exclusions }) =>
      matchesPath(changedPath, root) &&
      !exclusions.some((exclusion) => matchesPath(changedPath, exclusion))
    )
  ) {
    return true;
  }

  return FINANCIAL_PATHS.namedPaths.some((candidate) => matchesPath(changedPath, candidate));
}

function parseAutoDocsFromYaml(content) {
  const sectionMatch = content.match(/^auto_docs:\s*\n((?:[ \t]+-[ \t]+[^\n]*\n?)*)/m);
  if (!sectionMatch) return null;
  const items = [];
  for (const line of sectionMatch[1].split('\n')) {
    const itemMatch = line.match(/^[ \t]+-[ \t]+'?([^'\n]+?)'?\s*$/);
    if (itemMatch) items.push(itemMatch[1]);
  }
  return items.length > 0 ? items : null;
}

function loadLightAllowlist(filtersPath) {
  const content = readFileSync(filtersPath, 'utf8');
  const configured = parseAutoDocsFromYaml(content);
  if (!Array.isArray(configured) || configured.some((value) => typeof value !== 'string')) {
    throw new Error(`auto_docs is missing or malformed in ${filtersPath}`);
  }

  if (
    configured.length !== EXACT_LIGHT_ALLOWLIST.length ||
    configured.some((value, index) => value !== EXACT_LIGHT_ALLOWLIST[index])
  ) {
    throw new Error(
      `auto_docs must equal the reviewed five-file allowlist in ${filtersPath}`
    );
  }

  return new Set(configured);
}

const RAW_HEADER = new RegExp(
  '^:([0-7]{6}) ([0-7]{6}) ' +
    '((?:[0-9a-f]{40}|[0-9a-f]{64})) ' +
    '((?:[0-9a-f]{40}|[0-9a-f]{64})) ' +
    '([ADMUTXB]|[RC](?:[0-9]{1,2}|100))$'
);

function parseRawDiff(raw) {
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    throw new Error('changed-path input is empty');
  }

  const tokens = raw.toString('utf8').split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  if (tokens.length === 0) throw new Error('changed-path input is empty');

  const changes = [];
  for (let index = 0; index < tokens.length; ) {
    const header = tokens[index++];
    const matched = RAW_HEADER.exec(header);
    if (!matched) {
      throw new Error(`malformed raw change header: ${header || '(empty)'}`);
    }

    const [, oldMode, newMode, oldObject, newObject, status] = matched;
    if ((oldMode === '000000') !== /^0+$/.test(oldObject)) {
      throw new Error(`${status} record has contradictory old mode and object`);
    }
    if ((newMode === '000000') !== /^0+$/.test(newObject)) {
      throw new Error(`${status} record has contradictory new mode and object`);
    }

    if (/^[RC]/.test(status)) {
      const oldPath = tokens[index++];
      const newPath = tokens[index++];
      if (!oldPath || !newPath) {
        throw new Error(`${status} record is missing an old or new path`);
      }
      changes.push({ newMode, oldMode, paths: [oldPath, newPath], status });
      continue;
    }

    const changedPath = tokens[index++];
    if (!changedPath) throw new Error(`${status} record is missing a path`);
    changes.push({ newMode, oldMode, paths: [changedPath], status });
  }

  return changes;
}

function classify(raw, lightAllowlist) {
  const changes = parseRawDiff(raw);
  const autoDocsOnly = changes.every((change) => {
    const eligibleChange =
      (change.status === 'A' && change.oldMode === '000000' && change.newMode === '100644') ||
      (change.status === 'D' && change.oldMode === '100644' && change.newMode === '000000') ||
      (change.status === 'M' && change.oldMode === '100644' && change.newMode === '100644') ||
      (/^R(?:[0-9]{1,2}|100)$/.test(change.status) &&
        change.oldMode === '100644' &&
        change.newMode === '100644');

    return (
      eligibleChange &&
      change.paths.every((changedPath) => lightAllowlist.has(changedPath))
    );
  });
  const financialCalcRelevant = changes.some((change) =>
    change.paths.some((changedPath) => isFinancialPath(changedPath))
  );

  return {
    autoDocsOnly,
    changeCount: changes.length,
    financialCalcRelevant,
    heavyCiRelevant: !autoDocsOnly,
    valid: true,
  };
}

function parseArgs(argv) {
  const options = {
    base: '',
    filters: '.github/path-filters.yml',
    githubOutput: '',
    head: '',
    stdin: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--stdin') {
      options.stdin = true;
    } else if (argument === '--base') {
      options.base = argv[++index] ?? '';
    } else if (argument === '--head') {
      options.head = argv[++index] ?? '';
    } else if (argument === '--filters') {
      options.filters = argv[++index] ?? '';
    } else if (argument === '--github-output') {
      options.githubOutput = argv[++index] ?? '';
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  if (!options.filters) throw new Error('--filters requires a path');
  if (options.stdin && (options.base || options.head)) {
    throw new Error('--stdin cannot be combined with --base or --head');
  }
  if (!options.stdin) {
    if (!/^[0-9a-f]{40}$/.test(options.base) || !/^[0-9a-f]{40}$/.test(options.head)) {
      throw new Error('--base and --head must be lowercase 40-character commit SHAs');
    }
  }

  return options;
}

function readChangedPaths(options) {
  if (options.stdin) return readFileSync(0);

  const completed = spawnSync(
    'git',
    ['diff', '--raw', '-z', '--no-abbrev', '--find-renames', options.base, options.head, '--'],
    {
      encoding: null,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  if (completed.error) throw completed.error;
  if (completed.status !== 0) {
    throw new Error(`git diff failed with status ${String(completed.status)}`);
  }
  return completed.stdout;
}

function writeGitHubOutputs(outputPath, classification) {
  if (!outputPath) return;
  appendFileSync(
    outputPath,
    [
      `valid=${String(classification.valid)}`,
      `auto_docs_only=${String(classification.autoDocsOnly)}`,
      `financial_calc_relevant=${String(classification.financialCalcRelevant)}`,
      `heavy_ci_relevant=${String(classification.heavyCiRelevant)}`,
      `change_count=${String(classification.changeCount)}`,
      '',
    ].join('\n')
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const allowlist = loadLightAllowlist(options.filters);
    const classification = classify(readChangedPaths(options), allowlist);
    writeGitHubOutputs(options.githubOutput, classification);
    process.stdout.write(`${JSON.stringify(classification)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Change classification failed: ${message}\n`);
    process.exitCode = 1;
  }
}
