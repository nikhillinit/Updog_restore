#!/usr/bin/env node

/**
 * Feature Flags Guard - Analyzes flag changes and enforces governance.
 * Requires approval labels for sensitive changes.
 */

import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import process from 'node:process';
import ts from 'typescript';
import YAML from 'yaml';
import {
  assertGitCommit,
  assertValidGitRef,
  safeGitDiffFile,
  safeGitDiffFiles,
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

function readPullRequestEvent(env) {
  if (!env.GITHUB_EVENT_PATH) {
    throw new Error('Feature flags guard requires GITHUB_EVENT_PATH in CI');
  }

  let event;
  try {
    event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Feature flags guard could not read the pull_request event payload: ${error.message}`);
  }

  const pullRequest = event?.pull_request;
  const base = pullRequest?.base?.sha;
  const head = pullRequest?.head?.sha;
  const headRepository = pullRequest?.head?.repo?.full_name;
  const number = event?.number;
  const labelEntries = pullRequest?.labels;
  if (!SHA_PATTERN.test(base ?? '')) {
    throw new Error('Feature flags guard requires the exact event PR base SHA in CI');
  }
  if (!SHA_PATTERN.test(head ?? '')) {
    throw new Error('Feature flags guard requires the exact event PR head SHA in CI');
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(headRepository ?? '')) {
    throw new Error('Feature flags guard requires the exact event PR head repository in CI');
  }
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error('Feature flags guard requires the exact positive event PR number in CI');
  }
  if (
    !Array.isArray(labelEntries) ||
    labelEntries.some((label) => label === null || typeof label !== 'object' || typeof label.name !== 'string')
  ) {
    throw new Error('Feature flags guard requires event PR labels in CI');
  }

  return {
    base,
    head,
    headRepository,
    labels: labelEntries.map((label) => label.name),
    number: String(number),
  };
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
  const event = readPullRequestEvent(env);
  if (options.base && options.base.toLowerCase() !== event.base.toLowerCase()) {
    throw new Error('Feature flags guard base SHA does not match event PR provenance');
  }
  if (options.head && options.head.toLowerCase() !== event.head.toLowerCase()) {
    throw new Error('Feature flags guard head SHA does not match event PR provenance');
  }
  return event;
}

function resolveDiffRefs(options, env = process.env) {
  const refs = requireExactCiProvenance(options, env);
  const base = assertValidGitRef(refs.base);
  const head = assertValidGitRef(refs.head);
  const baseSha = assertGitCommit(base);
  const headSha = assertGitCommit(head);

  if (env.GITHUB_ACTIONS === 'true') {
    if (baseSha.toLowerCase() !== refs.base.toLowerCase()) {
      throw new Error('Resolved base commit does not match event PR provenance');
    }
    if (headSha.toLowerCase() !== refs.head.toLowerCase()) {
      throw new Error('Resolved head commit does not match event PR provenance');
    }
  }

  return { base: baseSha, head: headSha, labels: refs.labels };
}

function getDiff(base, head) {
  return safeGitDiffFiles(base, head);
}

function getFileChanges(file, base, head) {
  return safeGitDiffFile(base, head, file);
}

function getFileSnapshots(file, base, head) {
  return {
    before: safeGitReadFileAtCommit(base, file, { allowMissing: true }),
    after: safeGitReadFileAtCommit(head, file, { allowMissing: true }),
  };
}

function isFlagFile(file) {
  const fileName = file.split('/').at(-1) ?? '';
  return (
    /\.[cm]?[jt]sx?$/i.test(file) ||
    file.startsWith('flags/') ||
    /(^|[.-])(feature-?flags?|flags?)([.-]|$)/i.test(fileName) ||
    file.endsWith('.flags.json')
  );
}

function emptyFlagChanges() {
  return {
    added: [],
    removed: [],
    modified: [],
    exposureChanges: [],
    audienceChanges: [],
    killSwitchChanges: [],
    riskChanges: [],
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const RISK_LEVELS = new Map([
  ['low', 0],
  ['medium', 1],
  ['high', 2],
]);

function makeFlagSemantics() {
  return {
    activation: new Map(),
    audience: new Map(),
    emergency: undefined,
    exposeToClient: undefined,
    killSwitch: undefined,
    risk: undefined,
  };
}

function validatePercentage(flagName, path, value, format) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(
      `Malformed ${format} flag '${flagName}': ${path} must be a finite number from 0 to 100`
    );
  }
  return value;
}

function collectYamlAudience(flagName, value, path, audience) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectYamlAudience(flagName, entry, `${path}.${index}`, audience)
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [field, child] of Object.entries(value)) {
    const childPath = `${path}.${field}`;
    if (field === 'percentage') {
      audience.set(childPath, validatePercentage(flagName, childPath, child, 'YAML'));
    } else if (field === 'audience') {
      audience.set(childPath, validatePercentage(flagName, childPath, child, 'YAML'));
    } else {
      collectYamlAudience(flagName, child, childPath, audience);
    }
  }
}

function collectYamlFlagSemantics(flagName, config) {
  if (!isObject(config)) {
    throw new Error(`Malformed YAML flag '${flagName}': definition must be a mapping`);
  }

  const semantics = makeFlagSemantics();
  const addBoolean = (collection, path, value) => {
    if (typeof value !== 'boolean') {
      throw new Error(`Malformed YAML flag '${flagName}': ${path} must be boolean`);
    }
    collection.set(path, value);
  };

  if (Object.hasOwn(config, 'default')) {
    addBoolean(semantics.activation, 'default', config.default);
  }
  if (Object.hasOwn(config, 'targeting')) {
    if (!isObject(config.targeting)) {
      throw new Error(`Malformed YAML flag '${flagName}': targeting must be a mapping`);
    }
    if (Object.hasOwn(config.targeting, 'enabled')) {
      addBoolean(semantics.activation, 'targeting.enabled', config.targeting.enabled);
    }
    collectYamlAudience(flagName, config.targeting, 'targeting', semantics.audience);
  }
  if (Object.hasOwn(config, 'environments')) {
    if (!isObject(config.environments)) {
      throw new Error(`Malformed YAML flag '${flagName}': environments must be a mapping`);
    }
    for (const [environment, value] of Object.entries(config.environments)) {
      addBoolean(semantics.activation, `environments.${environment}`, value);
    }
  }
  if (Object.hasOwn(config, 'rolloutPercentage')) {
    semantics.audience.set(
      'rolloutPercentage',
      validatePercentage(flagName, 'rolloutPercentage', config.rolloutPercentage, 'YAML')
    );
  }
  for (const field of ['exposeToClient', 'killSwitch', 'emergency']) {
    if (!Object.hasOwn(config, field)) continue;
    if (typeof config[field] !== 'boolean') {
      throw new Error(`Malformed YAML flag '${flagName}': ${field} must be boolean`);
    }
    semantics[field] = config[field];
  }
  if (Object.hasOwn(config, 'risk')) {
    if (typeof config.risk !== 'string' || !RISK_LEVELS.has(config.risk)) {
      throw new Error(
        `Malformed YAML flag '${flagName}': risk must be one of ${[...RISK_LEVELS.keys()].join(', ')}`
      );
    }
    semantics.risk = config.risk;
  }

  return semantics;
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

  const hasCanonicalRoot = Object.hasOwn(document, 'flags');
  const hasFlatRoot = Object.hasOwn(document, 'key');
  if (hasCanonicalRoot === hasFlatRoot) {
    throw new Error(
      `Malformed YAML flag file ${file}: expected exactly one flags or key root; ambiguous roots are forbidden`
    );
  }

  const flags = new Map();
  if (hasCanonicalRoot) {
    if (!isObject(document.flags)) {
      throw new Error(`Malformed YAML flag file ${file}: flags must be a mapping`);
    }
    for (const [flagName, config] of Object.entries(document.flags)) {
      flags.set(flagName, collectYamlFlagSemantics(flagName, config));
    }
    return flags;
  }

  if (typeof document.key !== 'string' || document.key.trim().length === 0) {
    throw new Error(`Malformed YAML flag file ${file}: key must be a non-empty string`);
  }
  flags.set(document.key, collectYamlFlagSemantics(document.key, document));
  return flags;
}

function addExposureChange(changes, flagName) {
  if (!changes.exposureChanges.some((change) => change.flag === flagName)) {
    changes.exposureChanges.push({ flag: flagName, change: 'enabled', from: false, to: true });
  }
}

function compareFlagSemantics(flagName, previous, current, changes) {
  const activationPaths = new Set([...previous.activation.keys(), ...current.activation.keys()]);
  if (
    [...activationPaths].some(
      (path) => previous.activation.get(path) !== true && current.activation.get(path) === true
    ) ||
    (previous.exposeToClient !== true && current.exposeToClient === true)
  ) {
    addExposureChange(changes, flagName);
  }

  const audiencePaths = new Set([...previous.audience.keys(), ...current.audience.keys()]);
  for (const path of audiencePaths) {
    const from = previous.audience.get(path) ?? 0;
    const to = current.audience.get(path) ?? 0;
    if (to > from) {
      changes.audienceChanges.push({
        flag: flagName,
        change: 'increase',
        amount: to - from,
        from,
        to,
      });
    }
  }

  if (
    (previous.killSwitch === true && current.killSwitch !== true) ||
    (previous.emergency === true && current.emergency !== true)
  ) {
    changes.killSwitchChanges.push({ flag: flagName, change: 'removed', critical: true });
  }

  const previousRisk = previous.risk === undefined ? undefined : RISK_LEVELS.get(previous.risk);
  const currentRisk = current.risk === undefined ? undefined : RISK_LEVELS.get(current.risk);
  if (
    currentRisk !== undefined &&
    ((previousRisk !== undefined && currentRisk > previousRisk) ||
      (previousRisk === undefined && current.risk === 'high'))
  ) {
    changes.riskChanges.push({ flag: flagName, from: previous.risk, to: current.risk });
  }
}

function addNewFlagChanges(flagName, semantics, changes) {
  changes.added.push(flagName);
  if (
    [...semantics.activation.values()].some((value) => value === true) ||
    semantics.exposeToClient === true
  ) {
    addExposureChange(changes, flagName);
  }
  for (const [path, to] of semantics.audience) {
    if (to > 0) {
      changes.audienceChanges.push({
        flag: flagName,
        change: 'increase',
        amount: to,
        from: 0,
        path,
        to,
      });
    }
  }
  if (semantics.risk === 'high') {
    changes.riskChanges.push({ flag: flagName, from: 'absent', to: semantics.risk });
  }
}

function compareFlagMaps(before, after) {
  const changes = emptyFlagChanges();
  for (const [flagName, semantics] of after) {
    const previousSemantics = before.get(flagName);
    if (!previousSemantics) {
      addNewFlagChanges(flagName, semantics, changes);
      continue;
    }
    compareFlagSemantics(flagName, previousSemantics, semantics, changes);
  }
  for (const [flagName, semantics] of before) {
    if (after.has(flagName)) continue;
    changes.removed.push(flagName);
    if (semantics.killSwitch === true || semantics.emergency === true) {
      changes.killSwitchChanges.push({ flag: flagName, change: 'removed', critical: true });
    }
  }
  return changes;
}

function parseYamlFlagChanges(beforeContents, afterContents, file) {
  return compareFlagMaps(parseYamlFlags(beforeContents, file), parseYamlFlags(afterContents, file));
}

function propertyName(node) {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.text;
  }
  return undefined;
}

function unwrapJavaScriptExpression(node) {
  let expression = node;
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

function booleanLiteral(flagName, path, node, file) {
  node = unwrapJavaScriptExpression(node);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  throw new Error(`Malformed JavaScript flag '${flagName}' in ${file}: ${path} must be boolean`);
}

function numericLiteral(flagName, path, node, file) {
  node = unwrapJavaScriptExpression(node);
  if (!ts.isNumericLiteral(node)) {
    throw new Error(`Malformed JavaScript flag '${flagName}' in ${file}: ${path} must be numeric`);
  }
  return validatePercentage(flagName, path, Number(node.text), 'JavaScript');
}

function stringLiteral(flagName, path, node, file) {
  node = unwrapJavaScriptExpression(node);
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) {
    throw new Error(`Malformed JavaScript flag '${flagName}' in ${file}: ${path} must be a string`);
  }
  return node.text;
}

function collectJavaScriptAudience(flagName, node, path, audience, file) {
  node = unwrapJavaScriptExpression(node);
  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((entry, index) =>
      collectJavaScriptAudience(flagName, entry, `${path}.${index}`, audience, file)
    );
    return;
  }
  if (!ts.isObjectLiteralExpression(node)) return;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const field = propertyName(property.name);
    if (field === undefined) continue;
    const childPath = `${path}.${field}`;
    if (field === 'percentage') {
      audience.set(childPath, numericLiteral(flagName, childPath, property.initializer, file));
    } else if (field === 'audience') {
      audience.set(childPath, numericLiteral(flagName, childPath, property.initializer, file));
    } else {
      collectJavaScriptAudience(flagName, property.initializer, childPath, audience, file);
    }
  }
}

function collectJavaScriptFlagSemantics(flagName, object, file) {
  const semantics = makeFlagSemantics();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const field = propertyName(property.name);
    if (field === undefined) continue;
    if (field === 'enabled' || field === 'exposure') {
      semantics.activation.set(field, booleanLiteral(flagName, field, property.initializer, file));
    } else if (field === 'exposeToClient' || field === 'killSwitch' || field === 'emergency') {
      semantics[field] = booleanLiteral(flagName, field, property.initializer, file);
    } else if (field === 'rolloutPercentage' || field === 'percentage') {
      semantics.audience.set(field, numericLiteral(flagName, field, property.initializer, file));
    } else if (field === 'risk') {
      const risk = stringLiteral(flagName, field, property.initializer, file);
      if (!RISK_LEVELS.has(risk)) {
        throw new Error(
          `Malformed JavaScript flag '${flagName}' in ${file}: risk must be one of ${[...RISK_LEVELS.keys()].join(', ')}`
        );
      }
      semantics.risk = risk;
    } else if (field === 'targeting') {
      const targeting = unwrapJavaScriptExpression(property.initializer);
      if (!ts.isObjectLiteralExpression(targeting)) {
        throw new Error(
          `Malformed JavaScript flag '${flagName}' in ${file}: targeting must be an object literal`
        );
      }
      for (const targetingProperty of targeting.properties) {
        if (!ts.isPropertyAssignment(targetingProperty)) continue;
        if (propertyName(targetingProperty.name) === 'enabled') {
          semantics.activation.set(
            'targeting.enabled',
            booleanLiteral(flagName, 'targeting.enabled', targetingProperty.initializer, file)
          );
        }
      }
      collectJavaScriptAudience(
        flagName,
        targeting,
        'targeting',
        semantics.audience,
        file
      );
    }
  }
  return semantics;
}

function isJavaScriptFlagRegistry(object) {
  let expression = object;
  while (
    ts.isParenthesizedExpression(expression.parent) ||
    ts.isSatisfiesExpression(expression.parent) ||
    ts.isAsExpression(expression.parent) ||
    ts.isTypeAssertionExpression(expression.parent) ||
    ts.isNonNullExpression(expression.parent)
  ) {
    if (expression.parent.expression !== expression) return false;
    expression = expression.parent;
  }
  const parent = expression.parent;
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === expression &&
    ts.isIdentifier(parent.name)
  ) {
    return isJavaScriptFlagRegistryName(parent.name.text);
  }
  return isNestedExportDefaultFlagsProperty(parent);
}

function isJavaScriptFlagRegistryName(name) {
  const registryName = name.replaceAll('_', '').toLowerCase();
  return ['flags', 'featureflags', 'flagdefinitions'].includes(registryName);
}

function isStaticFlagsPropertyName(name) {
  if (propertyName(name) === 'flags') return true;
  return (
    ts.isComputedPropertyName(name) &&
    (ts.isStringLiteral(name.expression) ||
      ts.isNoSubstitutionTemplateLiteral(name.expression)) &&
    name.expression.text === 'flags'
  );
}

function isExportDefaultExpression(node) {
  let expression = node;
  while (
    ts.isParenthesizedExpression(expression.parent) ||
    ts.isSatisfiesExpression(expression.parent) ||
    ts.isAsExpression(expression.parent) ||
    ts.isTypeAssertionExpression(expression.parent) ||
    ts.isNonNullExpression(expression.parent)
  ) {
    if (expression.parent.expression !== expression) return false;
    expression = expression.parent;
  }
  return (
    ts.isExportAssignment(expression.parent) &&
    expression.parent.expression === expression &&
    !expression.parent.isExportEquals
  );
}

function isNestedExportDefaultFlagsProperty(node) {
  return (
    ts.isPropertyAssignment(node) &&
    isStaticFlagsPropertyName(node.name) &&
    ts.isObjectLiteralExpression(node.parent) &&
    isExportDefaultExpression(node.parent)
  );
}

function unsupportedJavaScriptConfigurationMember(object) {
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) return 'spread';
    if (!ts.isPropertyAssignment(property)) return 'indirect';
    if ('name' in property && property.name && ts.isComputedPropertyName(property.name)) {
      return 'computed';
    }
    if (ts.isPropertyAssignment(property)) {
      const initializer = unwrapJavaScriptExpression(property.initializer);
      if (!ts.isObjectLiteralExpression(initializer)) continue;
      const nested = unsupportedJavaScriptConfigurationMember(initializer);
      if (nested) return nested;
    }
  }
  return undefined;
}

function parseJavaScriptFlags(contents, file) {
  if (contents === null) return new Map();
  const scriptKind = /\.[cm]?tsx$/i.test(file)
    ? ts.ScriptKind.TSX
    : /\.[cm]?ts$/i.test(file)
      ? ts.ScriptKind.TS
      : /\.[cm]?jsx$/i.test(file)
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true, scriptKind);
  if (sourceFile.parseDiagnostics.length > 0) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    throw new Error(
      `Malformed JavaScript flag file ${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
    );
  }

  const declarations = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isJavaScriptFlagRegistryName(node.name.text) &&
      !ts.isObjectLiteralExpression(unwrapJavaScriptExpression(node.initializer))
    ) {
      throw new Error(
        `Malformed JavaScript flag file ${file}: indirect registry initializer is unsupported and failed closed`
      );
    }
    if (
      isNestedExportDefaultFlagsProperty(node) &&
      ts.isComputedPropertyName(node.name)
    ) {
      throw new Error(
        `Malformed JavaScript flag file ${file}: computed flags registry root is unsupported and failed closed`
      );
    }
    if (
      isNestedExportDefaultFlagsProperty(node) &&
      !ts.isObjectLiteralExpression(unwrapJavaScriptExpression(node.initializer))
    ) {
      throw new Error(
        `Malformed JavaScript flag file ${file}: indirect registry initializer is unsupported and failed closed`
      );
    }
    if (ts.isObjectLiteralExpression(node) && isJavaScriptFlagRegistry(node)) {
      const unsupportedMember = unsupportedJavaScriptConfigurationMember(node);
      if (unsupportedMember) {
        throw new Error(
          `Malformed JavaScript flag file ${file}: ${unsupportedMember} flag configuration is unsupported and failed closed`
        );
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isObjectLiteralExpression(node.parent) &&
      isJavaScriptFlagRegistry(node.parent)
    ) {
      const initializer = unwrapJavaScriptExpression(node.initializer);
      if (!ts.isObjectLiteralExpression(initializer)) {
        throw new Error(
          `Malformed JavaScript flag file ${file}: indirect flag entry initializer is unsupported and failed closed`
        );
      }
      const unsupportedMember = unsupportedJavaScriptConfigurationMember(initializer);
      if (unsupportedMember) {
        throw new Error(
          `Malformed JavaScript flag file ${file}: ${unsupportedMember} flag configuration is unsupported and failed closed`
        );
      }
      const flagName = propertyName(node.name);
      if (flagName === undefined) {
        throw new Error(
          `Malformed JavaScript flag file ${file}: governed declaration could not be uniquely bound`
        );
      }
      const existing = declarations.get(flagName) ?? [];
      existing.push(collectJavaScriptFlagSemantics(flagName, initializer, file));
      declarations.set(flagName, existing);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const flags = new Map();
  for (const [flagName, candidates] of declarations) {
    if (candidates.length !== 1) {
      throw new Error(
        `Malformed JavaScript flag file ${file}: '${flagName}' declaration is not unique`
      );
    }
    flags.set(flagName, candidates[0]);
  }
  return flags;
}

function parseJavaScriptFlagChanges(beforeContents, afterContents, file) {
  const before = parseJavaScriptFlags(beforeContents, file);
  const after = parseJavaScriptFlags(afterContents, file);
  return {
    changes: compareFlagMaps(before, after),
    hasRegistry: before.size > 0 || after.size > 0,
  };
}

function parseChangesForFile(file, base, head) {
  const snapshots = getFileSnapshots(file, base, head);
  if (/\.ya?ml$/i.test(file)) {
    return {
      changes: parseYamlFlagChanges(snapshots.before, snapshots.after, file),
      hasRegistry: true,
    };
  }
  if (/\.[cm]?[jt]sx?$/i.test(file)) {
    return parseJavaScriptFlagChanges(snapshots.before, snapshots.after, file);
  }
  throw new Error(`Unsupported feature flag file format: ${file}`);
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

  const combinedAudienceControlIncrease = changes.audienceChanges
    .filter((change) => change.flag === flagName)
    .reduce((sum, change) => sum + change.amount, 0);
  if (combinedAudienceControlIncrease > 10) {
    issues.push({
      type: 'audience_change',
      flag: flagName,
      severity: 'medium',
      message: `Flag '${flagName}' combined audience-control increases total ${combinedAudienceControlIncrease} percentage points`,
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

  const riskChange = changes.riskChanges.find((change) => change.flag === flagName);
  if (riskChange) {
    issues.push({
      type: 'risk_escalation',
      flag: flagName,
      severity: 'high',
      message: `Flag '${flagName}' risk escalated from ${riskChange.from} to ${riskChange.to}`,
    });
  }

  return issues;
}

function checkPRLabels(eventLabels) {
  try {
    const labels = eventLabels ?? JSON.parse(process.env.PR_LABELS || '[]');
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
      riskChanges: changes.riskChanges.length,
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
  const { base, head, labels: eventLabels } = resolveDiffRefs(options);
  const changedFiles = getDiff(base, head);
  const candidateFiles = changedFiles.filter(isFlagFile);
  const analyzedFiles = candidateFiles.map((file) => {
    getFileChanges(file, base, head);
    return { file, ...parseChangesForFile(file, base, head) };
  });
  const flagFiles = analyzedFiles.filter((analysis) => analysis.hasRegistry);

  if (flagFiles.length === 0) {
    console.log('No flag files changed');
    return 0;
  }

  console.log(`\nFlag files changed: ${flagFiles.length}`);
  flagFiles.forEach(({ file }) => console.log(`  - ${file}`));

  const allChanges = emptyFlagChanges();
  const allIssues = [];

  for (const { file, changes } of flagFiles) {
    console.log(`\nAnalyzing ${file}...`);
    for (const key of Object.keys(changes)) {
      allChanges[key].push(...changes[key]);
    }

    const flagsToAnalyze = [
      ...new Set([
        ...changes.added,
        ...changes.removed,
        ...changes.modified,
        ...changes.exposureChanges.map((change) => change.flag),
        ...changes.audienceChanges.map((change) => change.flag),
        ...changes.killSwitchChanges.map((change) => change.flag),
        ...changes.riskChanges.map((change) => change.flag),
      ]),
    ];
    for (const flag of flagsToAnalyze) {
      allIssues.push(...analyzeSensitivity(flag, changes));
    }
  }

  const labels = checkPRLabels(eventLabels);
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
