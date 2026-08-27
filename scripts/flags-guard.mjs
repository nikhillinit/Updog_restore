#!/usr/bin/env node

/**
 * Feature Flags Guard - Analyzes flag changes and enforces governance.
 * Requires approval labels for sensitive changes.
 */

import fs from 'fs/promises';
import process from 'node:process';
import YAML from 'yaml';
import {
  assertGitCommit,
  assertValidGitRef,
  safeGitDiffFile,
  safeGitDiffFiles,
  safeGitMergeBase,
  safeGitReadFileAtCommit,
} from './lib/git-security.mjs';

const SENSITIVE_FLAGS = [
  /payment/i,
  /billing/i,
  /auth/i,
  /security/i,
  /admin/i,
  /delete/i,
  /production/i,
  /rollout/i,
  /kill.*switch/i,
  /emergency/i,
];

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseOptions(args = process.argv.slice(2)) {
  const options = {
    base: readOption(args, '--base'),
    head: readOption(args, '--head'),
  };
  const knownArguments = new Set(['--base', '--head']);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!knownArguments.has(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }
  return options;
}

function requireExactCiProvenance(options, env = process.env) {
  const runningInGitHubActions = env.GITHUB_ACTIONS === 'true';
  if (!runningInGitHubActions) {
    return {
      base: options.base ?? 'main',
      head: options.head ?? 'HEAD',
    };
  }

  const eventName = env.GITHUB_EVENT_NAME;
  if (eventName !== 'pull_request') {
    throw new Error(
      `Feature flags guard requires pull_request provenance in CI, got: ${eventName || '<missing>'}`
    );
  }
  if (!options.base || !SHA_PATTERN.test(options.base)) {
    throw new Error('Feature flags guard requires an exact 40-character PR base SHA in CI');
  }
  if (!options.head || !SHA_PATTERN.test(options.head)) {
    throw new Error('Feature flags guard requires an exact 40-character PR head SHA in CI');
  }
  if (!env.PR_BASE_SHA || !SHA_PATTERN.test(env.PR_BASE_SHA)) {
    throw new Error('Feature flags guard requires the event PR base SHA in CI');
  }
  if (!env.PR_HEAD_SHA || !SHA_PATTERN.test(env.PR_HEAD_SHA)) {
    throw new Error('Feature flags guard requires the event PR head SHA in CI');
  }
  if (options.base.toLowerCase() !== env.PR_BASE_SHA.toLowerCase()) {
    throw new Error('Feature flags guard base SHA does not match event PR provenance');
  }
  if (options.head.toLowerCase() !== env.PR_HEAD_SHA.toLowerCase()) {
    throw new Error('Feature flags guard head SHA does not match event PR provenance');
  }
  if (!env.PR_NUMBER || !/^[1-9]\d*$/.test(env.PR_NUMBER)) {
    throw new Error('Feature flags guard requires the exact positive PR number in CI');
  }
  if (!env.PR_HEAD_REPOSITORY || !/^[^/\s]+\/[^/\s]+$/.test(env.PR_HEAD_REPOSITORY)) {
    throw new Error('Feature flags guard requires the exact PR head repository in CI');
  }

  return options;
}

function resolveDiffRefs(options, env = process.env) {
  const refs = requireExactCiProvenance(options, env);
  const base = assertValidGitRef(refs.base);
  const head = assertValidGitRef(refs.head);
  const baseSha = assertGitCommit(base);
  const headSha = assertGitCommit(head);

  if (env.GITHUB_ACTIONS === 'true') {
    if (baseSha.toLowerCase() !== env.PR_BASE_SHA.toLowerCase()) {
      throw new Error('Resolved base commit does not match event PR provenance');
    }
    if (headSha.toLowerCase() !== env.PR_HEAD_SHA.toLowerCase()) {
      throw new Error('Resolved head commit does not match event PR provenance');
    }
  }

  return { base: baseSha, head: headSha };
}

function getDiff(base, head) {
  return safeGitDiffFiles(base, head);
}

function getFileChanges(file, base, head) {
  return safeGitDiffFile(base, head, file);
}

function getFileSnapshots(file, base, head) {
  const mergeBase = safeGitMergeBase(base, head);
  return {
    before: safeGitReadFileAtCommit(mergeBase, file, { allowMissing: true }),
    after: safeGitReadFileAtCommit(head, file, { allowMissing: true }),
  };
}

function isFlagFile(file) {
  const fileName = file.split('/').at(-1) ?? '';
  return (
    file.startsWith('flags/') ||
    /(^|[.-])(feature-?flags?|flags?)([.-]|$)/i.test(fileName) ||
    file.endsWith('.flags.json') ||
    file.endsWith('.flags.ts') ||
    file.endsWith('.flags.js')
  );
}

function parseFlagChanges(diff) {
  const changes = {
    added: [],
    removed: [],
    modified: [],
    exposureChanges: [],
    audienceChanges: [],
    killSwitchChanges: [],
  };

  const lines = diff.split('\n');
  let currentFlag = null;
  const keyPattern = /^[-+ ]?\s*key:\s*["']?([^"'\s]+)["']?\s*$/;
  const objectFlagPattern = /["']([^"']+)["']\s*:\s*\{/;
  const removedEnabledFlags = new Map();

  for (const line of lines) {
    if (line.startsWith('@@')) {
      currentFlag = null;
      removedEnabledFlags.clear();
      continue;
    }

    const keyMatch = line.match(keyPattern);
    const objectFlagMatch = line.match(objectFlagPattern);
    if (keyMatch) currentFlag = keyMatch[1];
    if (objectFlagMatch) currentFlag = objectFlagMatch[1];

    const isAddition = line.startsWith('+') && !line.startsWith('+++');
    const isRemoval = line.startsWith('-') && !line.startsWith('---');
    if (!isAddition && !isRemoval) continue;

    if (isAddition && objectFlagMatch) changes.added.push(currentFlag);
    if (isRemoval && objectFlagMatch) changes.removed.push(currentFlag);

    const activationMatch = line.match(/\b(?:enabled|exposure)\s*:\s*(true|false)\b/);
    if (currentFlag && isRemoval && activationMatch?.[1] === 'false') {
      removedEnabledFlags.set(currentFlag, (removedEnabledFlags.get(currentFlag) ?? 0) + 1);
    }
    if (currentFlag && isAddition && activationMatch?.[1] === 'true') {
      const removedCount = removedEnabledFlags.get(currentFlag) ?? 0;
      if (removedCount > 0) {
        if (removedCount === 1) removedEnabledFlags.delete(currentFlag);
        else if (removedCount > 1) removedEnabledFlags.set(currentFlag, removedCount - 1);
        changes.exposureChanges.push({
          flag: currentFlag,
          change: 'enabled',
          from: false,
          to: true,
        });
      }
    }

    if (currentFlag && (line.includes('percentage:') || line.includes('audience:'))) {
      const percentMatch = line.match(/percentage:\s*(\d+)/);
      if (percentMatch) {
        const percent = Number.parseInt(percentMatch[1], 10);
        if (Math.abs(percent) > 10) {
          changes.audienceChanges.push({
            flag: currentFlag,
            change: isAddition ? 'increase' : 'decrease',
            amount: percent,
          });
        }
      }
    }

    if (
      currentFlag &&
      isRemoval &&
      (line.includes('killSwitch:') || line.includes('emergency:')) &&
      line.includes('true')
    ) {
      changes.killSwitchChanges.push({
        flag: currentFlag,
        change: 'removed',
        critical: true,
      });
    }
  }

  return changes;
}

function emptyFlagChanges() {
  return {
    added: [],
    removed: [],
    modified: [],
    exposureChanges: [],
    audienceChanges: [],
    killSwitchChanges: [],
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectActivationFields(flagName, config) {
  if (!isObject(config)) {
    throw new Error(`Malformed YAML flag '${flagName}': definition must be a mapping`);
  }

  const activation = new Map();
  const addBoolean = (path, value) => {
    if (typeof value !== 'boolean') {
      throw new Error(`Malformed YAML flag '${flagName}': ${path} must be boolean`);
    }
    activation.set(path, value);
  };

  if (Object.hasOwn(config, 'default')) addBoolean('default', config.default);
  if (Object.hasOwn(config, 'targeting')) {
    if (!isObject(config.targeting)) {
      throw new Error(`Malformed YAML flag '${flagName}': targeting must be a mapping`);
    }
    if (Object.hasOwn(config.targeting, 'enabled')) {
      addBoolean('targeting.enabled', config.targeting.enabled);
    }
  }
  if (Object.hasOwn(config, 'environments')) {
    if (!isObject(config.environments)) {
      throw new Error(`Malformed YAML flag '${flagName}': environments must be a mapping`);
    }
    for (const [environment, value] of Object.entries(config.environments)) {
      addBoolean(`environments.${environment}`, value);
    }
  }

  return activation;
}

function parseYamlFlags(contents, file) {
  if (contents === null) return new Map();

  let document;
  try {
    document = YAML.parse(contents);
  } catch (error) {
    throw new Error(
      `Malformed YAML flag file ${file}: ${error instanceof Error ? error.message : error}`
    );
  }
  if (document === null || document === undefined) return new Map();
  if (!isObject(document)) {
    throw new Error(`Malformed YAML flag file ${file}: root must be a mapping`);
  }

  const flags = new Map();
  if (Object.hasOwn(document, 'flags')) {
    if (!isObject(document.flags)) {
      throw new Error(`Malformed YAML flag file ${file}: flags must be a mapping`);
    }
    for (const [flagName, config] of Object.entries(document.flags)) {
      flags.set(flagName, collectActivationFields(flagName, config));
    }
    return flags;
  }

  if (Object.hasOwn(document, 'key')) {
    if (typeof document.key !== 'string' || document.key.trim().length === 0) {
      throw new Error(`Malformed YAML flag file ${file}: key must be a non-empty string`);
    }
    flags.set(document.key, collectActivationFields(document.key, document));
  }
  return flags;
}

function parseYamlFlagChanges(beforeContents, afterContents, file) {
  const before = parseYamlFlags(beforeContents, file);
  const after = parseYamlFlags(afterContents, file);
  const changes = emptyFlagChanges();

  for (const [flagName, activation] of after) {
    const previousActivation = before.get(flagName);
    if (!previousActivation) {
      changes.added.push(flagName);
      if ([...activation.values()].some((value) => value === true)) {
        changes.exposureChanges.push({
          flag: flagName,
          change: 'enabled',
          from: false,
          to: true,
        });
      }
      continue;
    }

    const activationPaths = new Set([...previousActivation.keys(), ...activation.keys()]);
    if (
      [...activationPaths].some(
        (path) => previousActivation.get(path) === false && activation.get(path) === true
      )
    ) {
      changes.exposureChanges.push({
        flag: flagName,
        change: 'enabled',
        from: false,
        to: true,
      });
    }
  }

  for (const flagName of before.keys()) {
    if (!after.has(flagName)) changes.removed.push(flagName);
  }

  return changes;
}

function parseChangesForFile(file, diff, base, head) {
  if (!/\.ya?ml$/i.test(file)) return parseFlagChanges(diff);
  const snapshots = getFileSnapshots(file, base, head);
  return parseYamlFlagChanges(snapshots.before, snapshots.after, file);
}

function analyzeSensitivity(flagName, changes) {
  const issues = [];

  if (SENSITIVE_FLAGS.some((pattern) => pattern.test(flagName))) {
    issues.push({
      type: 'sensitive_flag',
      flag: flagName,
      severity: 'high',
      message: `Flag '${flagName}' matches sensitive pattern`,
    });
  }

  const exposureChange = changes.exposureChanges.find((change) => change.flag === flagName);
  if (exposureChange?.to === true) {
    issues.push({
      type: 'exposure_enabled',
      flag: flagName,
      severity: 'medium',
      message: `Flag '${flagName}' is being enabled/exposed`,
    });
  }

  const audienceChange = changes.audienceChanges.find((change) => change.flag === flagName);
  if (audienceChange?.amount > 10) {
    issues.push({
      type: 'audience_change',
      flag: flagName,
      severity: 'medium',
      message: `Flag '${flagName}' audience changed by ${audienceChange.amount}%`,
    });
  }

  const killSwitchChange = changes.killSwitchChanges.find((change) => change.flag === flagName);
  if (killSwitchChange?.change === 'removed') {
    issues.push({
      type: 'kill_switch_removed',
      flag: flagName,
      severity: 'critical',
      message: `Kill switch removed from flag '${flagName}'`,
    });
  }

  return issues;
}

function checkPRLabels() {
  try {
    const labels = JSON.parse(process.env.PR_LABELS || '[]');
    if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string')) {
      throw new Error('PR_LABELS must be an array of strings');
    }
    return {
      hasProductSignoff: labels.includes('product-signoff'),
      hasFlagsApproval: labels.includes('approved:flags-change'),
      hasEmergencyOverride: labels.includes('emergency-override'),
    };
  } catch {
    return {
      hasProductSignoff: false,
      hasFlagsApproval: false,
      hasEmergencyOverride: false,
    };
  }
}

function generateReport(changes, issues, labels) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      flagsAdded: changes.added.length,
      flagsRemoved: changes.removed.length,
      flagsModified: changes.modified.length,
      exposureChanges: changes.exposureChanges.length,
      audienceChanges: changes.audienceChanges.length,
      killSwitchChanges: changes.killSwitchChanges.length,
    },
    issues,
    labels,
    requiresApproval: false,
    blocked: false,
    details: [],
  };

  const criticalIssues = issues.filter((issue) => issue.severity === 'critical');
  const highIssues = issues.filter((issue) => issue.severity === 'high');
  const mediumIssues = issues.filter((issue) => issue.severity === 'medium');

  if (criticalIssues.length > 0) {
    report.requiresApproval = true;
    report.blocked ||= !labels.hasEmergencyOverride;
    report.details.push('[CRITICAL] Kill switch or emergency flag changes detected');
  }
  if (highIssues.length > 0) {
    report.requiresApproval = true;
    report.blocked ||= !labels.hasFlagsApproval;
    report.details.push('[HIGH] Sensitive flag changes detected');
  }
  if (mediumIssues.length > 0) {
    report.requiresApproval = true;
    report.blocked ||= !labels.hasProductSignoff;
    report.details.push('[MEDIUM] Flag exposure/audience changes need product signoff');
  }

  return report;
}

async function guardFlags() {
  console.log('Feature Flags Guard');
  console.log('='.repeat(50));

  const options = parseOptions();
  const { base, head } = resolveDiffRefs(options);
  const changedFiles = getDiff(base, head);
  const flagFiles = changedFiles.filter(isFlagFile);

  if (flagFiles.length === 0) {
    console.log('No flag files changed');
    return 0;
  }

  console.log(`\nFlag files changed: ${flagFiles.length}`);
  flagFiles.forEach((file) => console.log(`  - ${file}`));

  const allChanges = emptyFlagChanges();
  const allIssues = [];

  for (const file of flagFiles) {
    console.log(`\nAnalyzing ${file}...`);
    const diff = getFileChanges(file, base, head);
    const changes = parseChangesForFile(file, diff, base, head);
    for (const key of Object.keys(changes)) {
      allChanges[key].push(...changes[key]);
    }

    const flagsToAnalyze = [
      ...new Set([
        ...changes.added,
        ...changes.modified,
        ...changes.exposureChanges.map((change) => change.flag),
        ...changes.audienceChanges.map((change) => change.flag),
        ...changes.killSwitchChanges.map((change) => change.flag),
      ]),
    ];
    for (const flag of flagsToAnalyze) {
      allIssues.push(...analyzeSensitivity(flag, changes));
    }
  }

  const labels = checkPRLabels();
  const report = generateReport(allChanges, allIssues, labels);

  console.log('\n' + '='.repeat(50));
  console.log('GUARD REPORT');
  console.log('='.repeat(50));
  if (allIssues.length > 0) {
    console.log('\nIssues Found:');
    for (const issue of allIssues) {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }

  await fs.writeFile('flags-guard-report.json', JSON.stringify(report, null, 2));
  console.log('\nDetailed report saved to flags-guard-report.json');

  if (report.blocked) {
    console.error('FLAG CHANGES BLOCKED');
    for (const detail of report.details) console.error(`  ${detail}`);
    console.error('Required labels:');
    if (!labels.hasProductSignoff) console.error('  - product-signoff');
    if (!labels.hasFlagsApproval) console.error('  - approved:flags-change');
    if (
      !labels.hasEmergencyOverride &&
      report.details.some((detail) => detail.includes('CRITICAL'))
    ) {
      console.error('  - emergency-override');
    }
    return 1;
  }

  console.log('FLAG CHANGES APPROVED');
  return 0;
}

guardFlags()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(
      'Feature flags guard failed closed:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  });
