#!/usr/bin/env node

import { config } from 'dotenv';
config({ quiet: true });

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  classifyDrizzlePushOutput,
  findMissingSentinels,
  matchesDbError,
  pgIdentifier,
} from './db-push-core.mjs';

const { Client } = pg;

export const DEFAULT_MANIFEST_DIR = 'scripts/prod-schema-manifests';
export const LEDGER_TABLE = 'prod_schema_reconcile_ledger';
export const RECONCILE_LOCK_ID = 20260628;
export const ACTION_SKIP = 'SKIP';
export const ACTION_APPLY_MISSING_DDL = 'APPLY-MISSING-DDL';
export const ACTION_REFUSE_FOR_HUMAN = 'REFUSE-FOR-HUMAN';
export const APPLY_0053_G3_RELEASE_GATE_HARDENING_FLAG =
  '--apply-0053-g3-release-gate-hardening';
const APPLY_0053_MANIFEST_PATH =
  'scripts/prod-schema-manifests/30-g3-release-gate-hardening.json';
const APPLY_0053_MANIFEST_NAME = 'g3-release-gate-hardening';
const APPLY_0053_SQL_PATH = 'migrations/0053_g3_release_gate_hardening.sql';
const APPLY_0053_MANIFEST_SHA256 =
  '14ac9b5318323d155c9c438689f4fa48c7bf8e6d7e36ae918e3aa57443ed9e0b';
const APPLY_0053_MIGRATION_SHA256 =
  '0a4c00cea6e20982db391be88f143bf4e1d4bc529b68e6b986530fc3354c9ea5';
export const MISSING_TABLE_POLICY_CREATE_OR_REPAIR = 'create_or_repair';
export const MISSING_TABLE_POLICY_EXISTING_REQUIRED = 'existing_table_required';

/** @typedef {'create_or_repair' | 'existing_table_required'} MissingTablePolicy */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const FORBIDDEN_SQL_PATTERN = /\b(?:neon_auth|drizzle_migrations)\b/i;
const MIGRATION_MARKER_PATTERN = /^\s*--\s*@(generated|drift-patch)\b/m;
const KNOWN_MANIFEST_KEYS = new Set([
  'name',
  'order',
  'description',
  'sqlFiles',
  'allowedCreateTables',
  'expectedTables',
  'dropObjects',
  'applyPolicy',
  'missingTablePolicy',
  'manifestPath',
  // WP-L3 T-A5: pg_proc-backed function-body pins (see functionDefinitions
  // validation below; the per-table sibling is expectedTables[].triggerDefinitions).
  'functionDefinitions',
]);
const MISSING_TABLE_POLICIES = new Set([
  MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
  MISSING_TABLE_POLICY_EXISTING_REQUIRED,
]);
const warnedMissingTablePolicyManifests = new Set();

export class ReconcileError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ReconcileError';
    this.details = details;
  }
}

export function parseReconcileArgs(argv, env = process.env) {
  const args = [...argv];
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');
  const apply0053G3ReleaseGateHardening = args.includes(
    APPLY_0053_G3_RELEASE_GATE_HARDENING_FLAG
  );
  const hasManifestDirArgument = args.some(
    (arg) => arg === '--manifest-dir' || arg.startsWith('--manifest-dir=')
  );
  if (apply || apply0053G3ReleaseGateHardening) {
    const exactApplyArguments =
      args.length === 3 &&
      args.filter((arg) => arg === '--apply').length === 1 &&
      args.filter((arg) => arg === '--yes').length === 1 &&
      args.filter((arg) => arg === APPLY_0053_G3_RELEASE_GATE_HARDENING_FLAG).length === 1;
    if (
      !exactApplyArguments ||
      hasManifestDirArgument ||
      Object.prototype.hasOwnProperty.call(env, 'UPDOG_SCHEMA_MANIFEST_DIR')
    ) {
      throw new ReconcileError(
        'Production schema mutation mechanically blocked pending action-specific hardening',
        { kind: 'production-mutation-blocked' }
      );
    }
  }
  const manifestDir =
    valueAfter(args, '--manifest-dir') ?? env.UPDOG_SCHEMA_MANIFEST_DIR ?? DEFAULT_MANIFEST_DIR;
  const expectedDatabase =
    valueAfter(args, '--expect-db') ?? env.UPDOG_EXPECTED_DATABASE ?? env.PGDATABASE ?? null;

  return {
    apply,
    yes,
    apply0053G3ReleaseGateHardening,
    manifestDir,
    expectedDatabase,
  };
}

export function assertApplyConfirmation({ apply, yes, apply0053G3ReleaseGateHardening }) {
  if (apply && (!yes || !apply0053G3ReleaseGateHardening)) {
    throw new ReconcileError(
      'Production schema mutation is mechanically blocked pending action-specific hardening',
      { kind: 'production-mutation-blocked' }
    );
  }
}

export function isPoolerUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    return /(?:^|-|[.])pooler(?:-|[.]|$)/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function assertDirectDatabaseUrl(connectionString) {
  if (!connectionString || connectionString === 'memory://') {
    throw new ReconcileError(
      'DATABASE_URL is missing or memory://; set it to the target database',
      {
        kind: 'missing-database-url',
      }
    );
  }

  if (isPoolerUrl(connectionString)) {
    throw new ReconcileError(
      'Refusing pooled database URL; DDL requires the direct Neon endpoint',
      {
        kind: 'pooler-url-refused',
      }
    );
  }
}

export async function loadManifests(manifestDir = DEFAULT_MANIFEST_DIR, rootDir = repoRoot) {
  const absoluteDir = path.resolve(rootDir, manifestDir);
  const files = (await fs.readdir(absoluteDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  const manifests = [];
  for (const fileName of files) {
    const manifestPath = path.join(absoluteDir, fileName);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifests.push({
      ...manifest,
      manifestPath: path.relative(rootDir, manifestPath).replace(/\\/g, '/'),
    });
  }

  return manifests.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function prepare0053G3ReleaseGateHardeningCapability({ rootDir = repoRoot } = {}) {
  const manifestFile = path.resolve(rootDir, APPLY_0053_MANIFEST_PATH);
  const migrationFile = path.resolve(rootDir, APPLY_0053_SQL_PATH);
  const [manifestBytes, migrationBytes] = await Promise.all([
    fs.readFile(manifestFile),
    fs.readFile(migrationFile),
  ]);
  const manifestSha256 = sha256(manifestBytes);
  const migrationSha256 = sha256(migrationBytes);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new ReconcileError('0053 capability manifest is malformed', {
      kind: 'invalid-0053-capability-binding',
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (
    manifestSha256 !== APPLY_0053_MANIFEST_SHA256 ||
    migrationSha256 !== APPLY_0053_MIGRATION_SHA256 ||
    manifest.name !== APPLY_0053_MANIFEST_NAME ||
    !Array.isArray(manifest.sqlFiles) ||
    manifest.sqlFiles.length !== 1 ||
    manifest.sqlFiles[0] !== APPLY_0053_SQL_PATH
  ) {
    throw new ReconcileError('0053 capability target binding does not match canonical bytes', {
      kind: 'invalid-0053-capability-binding',
    });
  }
  const manifests = await loadManifests(DEFAULT_MANIFEST_DIR, rootDir);
  const canonicalManifestIdentities = manifests.map((candidate) =>
    Object.freeze({
      name: candidate.name,
      manifestPath: candidate.manifestPath,
      order: candidate.order,
    })
  );
  const canonicalTarget = canonicalManifestIdentities.find(
    (candidate) => candidate.name === APPLY_0053_MANIFEST_NAME
  );
  if (
    !canonicalTarget ||
    canonicalTarget.manifestPath !== APPLY_0053_MANIFEST_PATH ||
    canonicalManifestIdentities.filter((candidate) => candidate.name === APPLY_0053_MANIFEST_NAME)
      .length !== 1
  ) {
    throw new ReconcileError('0053 capability target is absent from canonical manifest set', {
      kind: 'invalid-0053-capability-binding',
    });
  }
  const target = Object.freeze({
    manifestPath: APPLY_0053_MANIFEST_PATH,
    manifestName: APPLY_0053_MANIFEST_NAME,
    sqlPath: APPLY_0053_SQL_PATH,
    manifestSha256,
    migrationSha256,
    manifestRawJson: manifestBytes.toString('utf8'),
    canonicalManifestIdentities: Object.freeze(canonicalManifestIdentities),
  });
  return Object.freeze({
    ...target,
    manifests: Object.freeze(manifests),
    canonicalManifestIdentities: Object.freeze(canonicalManifestIdentities),
    target,
  });
}

export async function assertPrepared0053G3ReleaseGateHardeningCapability({
  capability,
  prepared,
  rootDir = repoRoot,
}) {
  const manifestBytes = await fs.readFile(path.resolve(rootDir, capability?.manifestPath ?? ''));
  if (
    sha256(manifestBytes) !== capability?.manifestSha256 ||
    prepared?.manifest?.manifestPath !== capability?.manifestPath ||
    prepared?.manifest?.name !== capability?.manifestName ||
    !Array.isArray(prepared?.manifest?.sqlFiles) ||
    prepared.manifest.sqlFiles.length !== 1 ||
    prepared.manifest.sqlFiles[0] !== capability?.sqlPath ||
    !Array.isArray(prepared?.sqlFiles) ||
    prepared.sqlFiles.length !== 1 ||
    prepared.sqlFiles[0]?.path !== capability?.sqlPath ||
    prepared.sqlFiles[0]?.checksum !== capability?.migrationSha256 ||
    (prepared.dropStatements?.length ?? 0) !== 0
  ) {
    throw new ReconcileError('0053 selected prepared manifest no longer matches pinned canonical bytes', {
      kind: 'invalid-0053-capability-binding',
    });
  }
}

export function selectExact0053G3ReleaseGateHardeningApply({
  preparedManifests,
  audits,
  target,
}) {
  if (
    !Array.isArray(preparedManifests) ||
    !Array.isArray(audits) ||
    target?.manifestPath !== APPLY_0053_MANIFEST_PATH ||
    target?.manifestName !== APPLY_0053_MANIFEST_NAME ||
    target?.sqlPath !== APPLY_0053_SQL_PATH ||
    target?.manifestSha256 !== APPLY_0053_MANIFEST_SHA256 ||
    target?.migrationSha256 !== APPLY_0053_MIGRATION_SHA256
  ) {
    throw new ReconcileError('0053 exact target-only selector received malformed capability', {
      kind: 'invalid-0053-selection',
    });
  }

  const preparedByName = new Map();
  for (const prepared of preparedManifests) {
    const name = prepared?.manifest?.name;
    if (typeof name !== 'string' || name.length === 0 || preparedByName.has(name)) {
      throw new ReconcileError('0053 exact target-only selector received malformed manifests', {
        kind: 'invalid-0053-selection',
      });
    }
    preparedByName.set(name, prepared);
  }
  if (!preparedByName.has(target.manifestName) || audits.length !== preparedByName.size) {
    throw new ReconcileError('0053 exact target-only selector requires complete audit vector', {
      kind: 'invalid-0053-selection',
    });
  }
  const canonicalManifestIdentities = target.canonicalManifestIdentities;
  if (
    !Array.isArray(canonicalManifestIdentities) ||
    canonicalManifestIdentities.length !== preparedManifests.length ||
    canonicalManifestIdentities.some(
      (identity, index) =>
        identity?.name !== preparedManifests[index]?.manifest?.name ||
        identity?.manifestPath !== preparedManifests[index]?.manifest?.manifestPath ||
        identity?.order !== preparedManifests[index]?.manifest?.order ||
        audits[index]?.manifest !== identity.name
    )
  ) {
    throw new ReconcileError('0053 exact target-only selector requires canonical complete order', {
      kind: 'invalid-0053-selection',
    });
  }

  const auditedNames = new Set();
  for (const audit of audits) {
    const hasMalformedObject = audit?.objects?.some(
      (object) =>
        typeof object !== 'object' ||
        object === null ||
        Array.isArray(object) ||
        typeof object.table !== 'string' ||
        object.table.length === 0 ||
        typeof object.present !== 'boolean' ||
        typeof object.populated !== 'boolean' ||
        ![ACTION_SKIP, ACTION_APPLY_MISSING_DDL, ACTION_REFUSE_FOR_HUMAN].includes(
          object.action
        ) ||
        !Array.isArray(object.deltas) ||
        object.deltas.some(
          (delta) =>
            typeof delta !== 'object' ||
            delta === null ||
            Array.isArray(delta) ||
            typeof delta.kind !== 'string' ||
            delta.kind.length === 0 ||
            ('additiveSafe' in delta && typeof delta.additiveSafe !== 'boolean') ||
            ('humanReviewRequired' in delta && typeof delta.humanReviewRequired !== 'boolean')
        )
    );
    if (
      !audit ||
      typeof audit.manifest !== 'string' ||
      !Array.isArray(audit.objects) ||
      hasMalformedObject ||
      ![ACTION_SKIP, ACTION_APPLY_MISSING_DDL, ACTION_REFUSE_FOR_HUMAN].includes(audit.action) ||
      !preparedByName.has(audit.manifest) ||
      auditedNames.has(audit.manifest)
    ) {
      throw new ReconcileError('0053 exact target-only selector received malformed audit vector', {
        kind: 'invalid-0053-selection',
      });
    }
    auditedNames.add(audit.manifest);
    if (audit.action === ACTION_REFUSE_FOR_HUMAN) {
      throw new ReconcileError('0053 exact target-only selector refuses human-review state', {
        kind: 'human-review-required',
      });
    }
    if (
      audit.objects.some(
        (object) =>
          object?.action === ACTION_REFUSE_FOR_HUMAN ||
          object?.deltas?.some((delta) => /(?:drop|destructive)/i.test(String(delta?.kind ?? '')))
      )
    ) {
      throw new ReconcileError('0053 exact target-only selector refuses destructive audit state', {
        kind: 'invalid-0053-selection',
      });
    }
    if (
      (audit.manifest === target.manifestName && audit.action !== ACTION_APPLY_MISSING_DDL) ||
      (audit.manifest !== target.manifestName && audit.action !== ACTION_SKIP)
    ) {
      throw new ReconcileError('0053 exact target-only selector requires exact target-only state', {
        kind: 'invalid-0053-selection',
      });
    }
  }
  return preparedByName.get(target.manifestName);
}

export function buildLockTimeApplyVectorV1({ preparedManifests, audits, target }) {
  selectExact0053G3ReleaseGateHardeningApply({ preparedManifests, audits, target });
  const auditByManifest = new Map(audits.map((audit) => [audit.manifest, audit]));
  const vector = {
    schemaVersion: 1,
    source: 'lock-time-audit',
    lockId: RECONCILE_LOCK_ID,
    target: {
      manifestPath: target.manifestPath,
      manifestName: target.manifestName,
      sqlPath: target.sqlPath,
      manifestSha256: target.manifestSha256,
      migrationSha256: target.migrationSha256,
    },
    decisions: preparedManifests.map((prepared) => ({
      manifest: prepared.manifest.name,
      action: auditByManifest.get(prepared.manifest.name).action,
    })),
  };
  return `PROD_SCHEMA_LOCK_TIME_VECTOR_V1=${JSON.stringify(vector)}`;
}

export function parseLockTimeApplyVectorV1(markerOutput, { preparedManifests, target }) {
  const markers = String(markerOutput)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('PROD_SCHEMA_LOCK_TIME_VECTOR_V1='));
  if (markers.length !== 1) {
    throw new ReconcileError('Lock-time apply vector marker must appear exactly once', {
      kind: 'invalid-lock-time-apply-vector',
    });
  }
  const expectedAudits = preparedManifests.map((prepared) => ({
    manifest: prepared?.manifest?.name,
    action:
      prepared?.manifest?.name === target?.manifestName ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
    objects: [],
  }));
  const expected = buildLockTimeApplyVectorV1({
    preparedManifests,
    audits: expectedAudits,
    target,
  });
  if (markers[0] !== expected) {
    throw new ReconcileError('Lock-time apply vector marker is not canonical', {
      kind: 'invalid-lock-time-apply-vector',
    });
  }
  return JSON.parse(markers[0].slice('PROD_SCHEMA_LOCK_TIME_VECTOR_V1='.length));
}

export async function readManifestSql(manifest, rootDir = repoRoot) {
  const files = [];
  for (const relPath of manifest.sqlFiles ?? []) {
    const absolutePath = path.resolve(rootDir, relPath);
    const sql = await fs.readFile(absolutePath, 'utf8');
    files.push({
      path: relPath,
      sql,
      checksum: sha256(sql),
      statements: splitSqlStatements(sql),
    });
  }
  return files;
}

export function splitSqlStatements(sql) {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function manifestChecksum(manifest, sqlFiles) {
  return sha256(
    JSON.stringify({
      name: manifest.name,
      sqlFiles: sqlFiles.map((file) => ({ path: file.path, checksum: file.checksum })),
      expectedTables: manifest.expectedTables ?? [],
      // Drop entries (incl. reverseSql) are ledger-identity: a materially
      // different drop manifest must never dedup against a committed row
      // (s8.1 red-team F3). Safe to add while the prod ledger is empty.
      dropObjects: manifest.dropObjects ?? [],
      applyPolicy: manifest.applyPolicy ?? {},
      // Only manifests that PIN function bodies carry the key, so every
      // pre-existing manifest checksum stays byte-identical (ledger dedupe).
      ...(manifest.functionDefinitions
        ? { functionDefinitions: manifest.functionDefinitions }
        : {}),
    })
  );
}

function manifestLabel(manifest) {
  return String(manifest?.manifestPath ?? manifest?.name ?? '<unknown>');
}

function validateManifestKeys(manifest) {
  for (const key of Object.keys(manifest ?? {})) {
    if (!KNOWN_MANIFEST_KEYS.has(key)) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} has unsupported top-level key ${key}`,
        {
          kind: 'unknown-manifest-key',
          manifest: manifestLabel(manifest),
          key,
        }
      );
    }
  }
}

function validateMissingTablePolicyValue(manifest) {
  if (manifest?.missingTablePolicy === undefined) {
    return;
  }
  if (!MISSING_TABLE_POLICIES.has(manifest.missingTablePolicy)) {
    throw new ReconcileError(
      `Manifest ${manifestLabel(manifest)} has invalid missingTablePolicy ${String(manifest.missingTablePolicy)}`,
      {
        kind: 'invalid-missing-table-policy',
        manifest: manifestLabel(manifest),
        missingTablePolicy: manifest.missingTablePolicy,
      }
    );
  }
}

function validateManifest(manifest) {
  validateManifestKeys(manifest);
  validateMissingTablePolicyValue(manifest);
  validateExpectedTables(manifest);
  validateFunctionDefinitions(manifest);
  validateApplyPolicy(manifest);
}

/** Shared shape contract for constraintDefinitions / indexDefinitions /
 * triggerDefinitions / functionDefinitions expected-definition pins. */
function isValidExpectedDefinition(expectedDefinition) {
  return (
    Boolean(expectedDefinition) &&
    typeof expectedDefinition.exactDefinition === 'string' &&
    expectedDefinition.exactDefinition.trim().length > 0 &&
    Array.isArray(expectedDefinition.orderedFragments) &&
    expectedDefinition.orderedFragments.length > 0 &&
    expectedDefinition.orderedFragments.every(
      (fragment) => typeof fragment === 'string' && fragment.trim().length > 0
    ) &&
    Array.isArray(expectedDefinition.stringLiterals) &&
    expectedDefinition.stringLiterals.every(
      (literal) => typeof literal === 'string' && literal.length > 0
    )
  );
}

function validateFunctionDefinitions(manifest) {
  const seenNames = new Set();
  for (const functionDefinition of manifest?.functionDefinitions ?? []) {
    assertSafeIdentifier(String(functionDefinition.name ?? ''));
    if (
      seenNames.has(functionDefinition.name) ||
      !isValidExpectedDefinition(functionDefinition.expectedDefinition)
    ) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} functionDefinitions target ${String(functionDefinition.name)} must be named exactly once and provide an exact definition, ordered fragments, and string literals`,
        {
          kind: 'invalid-function-definition',
          manifest: manifestLabel(manifest),
          name: functionDefinition.name,
        }
      );
    }
    seenNames.add(functionDefinition.name);
  }
}

function validateExpectedTables(manifest) {
  for (const table of manifest?.expectedTables ?? []) {
    const indexes = new Set(table.indexes ?? []);
    const seenIndexDefinitions = new Set();

    for (const indexDefinition of table.indexDefinitions ?? []) {
      assertSafeIdentifier(String(indexDefinition.name ?? ''));
      if (
        !indexes.has(indexDefinition.name) ||
        seenIndexDefinitions.has(indexDefinition.name) ||
        !isValidExpectedDefinition(indexDefinition.expectedDefinition)
      ) {
        throw new ReconcileError(
          `Manifest ${manifestLabel(manifest)} indexDefinitions target ${table.name}.${String(indexDefinition.name)} must name an expected index exactly once and provide an exact definition, ordered fragments, and string literals`,
          {
            kind: 'invalid-index-definition',
            manifest: manifestLabel(manifest),
            table: table.name,
            name: indexDefinition.name,
          }
        );
      }
      seenIndexDefinitions.add(indexDefinition.name);
    }

    const constraints = new Set(table.constraints ?? []);
    const seenConstraintDefinitions = new Set();
    for (const constraintDefinition of table.constraintDefinitions ?? []) {
      assertSafeIdentifier(String(constraintDefinition.name ?? ''));
      if (
        !constraints.has(constraintDefinition.name) ||
        seenConstraintDefinitions.has(constraintDefinition.name) ||
        !isValidExpectedDefinition(constraintDefinition.expectedDefinition)
      ) {
        throw new ReconcileError(
          `Manifest ${manifestLabel(manifest)} constraintDefinitions target ${table.name}.${String(constraintDefinition.name)} must name an expected constraint exactly once and provide an exact definition, ordered fragments, and string literals`,
          {
            kind: 'invalid-constraint-definition',
            manifest: manifestLabel(manifest),
            table: table.name,
            name: constraintDefinition.name,
          }
        );
      }
      seenConstraintDefinitions.add(constraintDefinition.name);
    }

    const seenTriggers = new Set();
    for (const triggerDefinition of table.triggerDefinitions ?? []) {
      assertSafeIdentifier(String(triggerDefinition.name ?? ''));
      if (
        seenTriggers.has(triggerDefinition.name) ||
        !isValidExpectedDefinition(triggerDefinition.expectedDefinition)
      ) {
        throw new ReconcileError(
          `Manifest ${manifestLabel(manifest)} triggerDefinitions target ${table.name}.${String(triggerDefinition.name)} must be named exactly once and provide an exact definition, ordered fragments, and string literals`,
          {
            kind: 'invalid-trigger-definition',
            manifest: manifestLabel(manifest),
            table: table.name,
            name: triggerDefinition.name,
          }
        );
      }
      seenTriggers.add(triggerDefinition.name);
    }
  }
}

function validateApplyPolicy(manifest) {
  const applyPolicy = manifest?.applyPolicy;
  if (applyPolicy === undefined) {
    return;
  }

  const knownPolicyKeys = new Set([
    'allowDropNotNull',
    'allowConstraintReplacements',
    'allowNonNullColumnAdds',
  ]);
  for (const key of Object.keys(applyPolicy ?? {})) {
    if (!knownPolicyKeys.has(key)) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} has unsupported applyPolicy key ${key}`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          key,
        }
      );
    }
  }

  const tables = new Map((manifest.expectedTables ?? []).map((table) => [table.name, table]));
  const seenNonNullColumnAdds = new Set();
  for (const target of applyPolicy.allowNonNullColumnAdds ?? []) {
    assertSafeIdentifier(String(target.table ?? ''));
    assertSafeIdentifier(String(target.column ?? ''));
    const key = `${target.table}.${target.column}`;
    if (seenNonNullColumnAdds.has(key)) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} has duplicate applyPolicy target ${key}`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          target: key,
        }
      );
    }
    seenNonNullColumnAdds.add(key);
    const expectedColumn = tables
      .get(target.table)
      ?.columns?.find((column) => column.name === target.column);
    if (expectedColumn?.nullable !== false) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} allowNonNullColumnAdds target ${key} is not an expected non-null column`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          target: key,
        }
      );
    }
  }

  const seenDropNotNull = new Set();
  for (const target of applyPolicy.allowDropNotNull ?? []) {
    assertSafeIdentifier(String(target.table ?? ''));
    assertSafeIdentifier(String(target.column ?? ''));
    const key = `${target.table}.${target.column}`;
    if (seenDropNotNull.has(key)) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} has duplicate applyPolicy target ${key}`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          target: key,
        }
      );
    }
    seenDropNotNull.add(key);
    const expectedColumn = tables
      .get(target.table)
      ?.columns?.find((column) => column.name === target.column);
    if (expectedColumn?.nullable !== true) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} allowDropNotNull target ${key} is not an expected nullable column`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          target: key,
        }
      );
    }
  }

  const seenConstraintReplacement = new Set();
  for (const target of applyPolicy.allowConstraintReplacements ?? []) {
    assertSafeIdentifier(String(target.table ?? ''));
    assertSafeIdentifier(String(target.name ?? ''));
    const expectedDefinition = target.expectedDefinition;
    if (
      !expectedDefinition ||
      !Array.isArray(expectedDefinition.requiredFragments) ||
      expectedDefinition.requiredFragments.length === 0 ||
      expectedDefinition.requiredFragments.some(
        (fragment) => typeof fragment !== 'string' || fragment.trim().length === 0
      ) ||
      // A numeric-only constraint (e.g. residue-count equality) legitimately
      // has zero string literals; an empty array is an explicit declaration
      // that the live definition must contain none, enforced by exact
      // multiset comparison in constraintDefinitionMatches.
      !Array.isArray(expectedDefinition.stringLiterals) ||
      expectedDefinition.stringLiterals.some(
        (literal) => typeof literal !== 'string' || literal.length === 0
      )
    ) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} allowConstraintReplacements target ${target.table}.${target.name} requires expectedDefinition fragments and string literals`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          target: `${target.table}.${target.name}`,
        }
      );
    }
    const key = `${target.table}.${target.name}`;
    if (seenConstraintReplacement.has(key)) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} has duplicate applyPolicy target ${key}`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          target: key,
        }
      );
    }
    seenConstraintReplacement.add(key);
    const constraints = tables.get(target.table)?.constraints ?? [];
    if (!constraints.includes(target.name)) {
      throw new ReconcileError(
        `Manifest ${manifestLabel(manifest)} allowConstraintReplacements target ${key} is not an expected constraint`,
        {
          kind: 'invalid-apply-policy',
          manifest: manifestLabel(manifest),
          target: key,
        }
      );
    }
  }
}

function resolveMissingTablePolicy(manifest) {
  validateManifest(manifest);
  if (manifest?.missingTablePolicy !== undefined) {
    return manifest.missingTablePolicy;
  }

  const label = manifestLabel(manifest);
  if (!warnedMissingTablePolicyManifests.has(label)) {
    warnedMissingTablePolicyManifests.add(label);
    console.warn(
      `Manifest ${label} has no missingTablePolicy; defaulting to ${MISSING_TABLE_POLICY_CREATE_OR_REPAIR} (deprecated)`
    );
  }
  return MISSING_TABLE_POLICY_CREATE_OR_REPAIR;
}

export function statementHashes(sqlFiles, extraStatements = []) {
  return [
    ...sqlFiles.flatMap((file) =>
      file.statements.map((statement, index) => ({
        file: file.path,
        index,
        hash: sha256(statement),
      }))
    ),
    ...extraStatements.map((statement, index) => ({
      file: '<dropObjects>',
      index,
      hash: sha256(statement),
    })),
  ];
}

export function validateDropObjects(manifest) {
  validateManifest(manifest);
  for (const drop of manifest.dropObjects ?? []) {
    if (drop.kind !== 'index' && drop.kind !== 'constraint') {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: unsupported kind ${String(drop.kind)}`,
        { kind: 'unsupported-drop-kind', manifest: manifest.name, drop }
      );
    }
    assertSafeIdentifier(drop.name);
    if (drop.name.length > 63) {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: ${drop.name} exceeds the 63-byte identifier limit; drop targets must be actual catalog names`,
        { kind: 'drop-name-too-long', manifest: manifest.name, name: drop.name }
      );
    }
    if (drop.kind === 'constraint') {
      if (!drop.table) {
        throw new ReconcileError(
          `Manifest ${manifest.name} dropObjects: constraint ${drop.name} is missing its table`,
          { kind: 'missing-drop-table', manifest: manifest.name, name: drop.name }
        );
      }
      assertSafeIdentifier(drop.table);
    }
    if (typeof drop.reverseSql !== 'string' || drop.reverseSql.trim().length === 0) {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: ${drop.name} is missing reverseSql (emergency rollback must be written down, not improvised)`,
        { kind: 'missing-reverse-sql', manifest: manifest.name, name: drop.name }
      );
    }
    if (typeof drop.reason !== 'string' || drop.reason.trim().length === 0) {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: ${drop.name} is missing its reason`,
        { kind: 'missing-drop-reason', manifest: manifest.name, name: drop.name }
      );
    }
  }
}

export function dropStatements(manifest) {
  return (manifest.dropObjects ?? []).map((drop) => {
    assertSafeIdentifier(drop.name);
    if (drop.kind === 'index') {
      return `DROP INDEX IF EXISTS "${drop.name}"`;
    }
    assertSafeIdentifier(drop.table);
    return `ALTER TABLE "${drop.table}" DROP CONSTRAINT IF EXISTS "${drop.name}"`;
  });
}

export function validateManifestSql(manifest, sqlFiles) {
  validateManifest(manifest);
  const allowedCreates = new Set([
    ...(manifest.allowedCreateTables ?? []),
    ...(manifest.expectedTables ?? []).map((table) => table.name),
  ]);

  for (const file of sqlFiles) {
    if (!MIGRATION_MARKER_PATTERN.test(file.sql)) {
      throw new ReconcileError(`${file.path} is missing -- @generated or -- @drift-patch marker`, {
        kind: 'missing-migration-marker',
        file: file.path,
      });
    }

    if (FORBIDDEN_SQL_PATTERN.test(file.sql)) {
      throw new ReconcileError(`${file.path} references a forbidden schema-management table`, {
        kind: 'forbidden-sql-target',
        file: file.path,
      });
    }

    for (const tableName of extractCreateTableNames(file.sql)) {
      if (!allowedCreates.has(tableName)) {
        throw new ReconcileError(
          `${file.path} creates ${tableName}, which is not declared in manifest ${manifest.name}`,
          {
            kind: 'undeclared-create',
            file: file.path,
            tableName,
            manifest: manifest.name,
          }
        );
      }
    }
  }

  const nonNullColumnAddViolations = validateNonNullColumnAddPolicy(manifest, sqlFiles);
  if (nonNullColumnAddViolations.length > 0) {
    throw new ReconcileError(
      `Manifest ${manifest.name} has SQL outside allowNonNullColumnAdds policy`,
      {
        kind: 'invalid-non-null-column-add-policy',
        manifest: manifest.name,
        violations: nonNullColumnAddViolations,
      }
    );
  }
}

export function validateNonNullColumnAddPolicy(manifest, sqlFiles) {
  const allowedTargets = manifest.applyPolicy?.allowNonNullColumnAdds ?? [];
  if (allowedTargets.length === 0) {
    return [];
  }

  const allowedKeys = new Set(allowedTargets.map((target) => `${target.table}.${target.column}`));
  const additions = [];
  const violations = [];

  for (const file of sqlFiles) {
    const statements = splitSqlStatements(file.sql)
      .map((statement) => stripSqlComments(statement).trim())
      .filter(Boolean);

    for (const statement of statements) {
      if (!/\bALTER\s+TABLE\b/i.test(statement) || !/\bADD\s+COLUMN\b/i.test(statement)) {
        continue;
      }

      const parsed = parseAlterTableAddColumn(statement);
      if (!parsed) {
        violations.push({
          manifest: manifest.name,
          file: file.path,
          kind: 'malformed-non-null-column-add',
          statement,
          reason: 'ALTER TABLE ADD COLUMN must be one direct, parseable statement',
        });
        continue;
      }

      const isNonNullAdd = /\bNOT\s+NULL\b/i.test(parsed.definition);
      if (!isNonNullAdd && !allowedKeys.has(parsed.key)) {
        continue;
      }

      additions.push({ ...parsed, file: file.path, statement });
      if (!allowedKeys.has(parsed.key)) {
        violations.push({
          manifest: manifest.name,
          file: file.path,
          kind: 'undeclared-non-null-column-add',
          statement,
          reason: `${parsed.key} is not declared in allowNonNullColumnAdds`,
        });
        continue;
      }

      if (!isSafeNonNullColumnAdd(parsed)) {
        violations.push({
          manifest: manifest.name,
          file: file.path,
          kind: 'invalid-non-null-column-add',
          statement,
          reason: `${parsed.key} must use IF NOT EXISTS and exactly one NOT NULL DEFAULT with a proven non-null value`,
        });
      }
    }
  }

  for (const target of allowedTargets) {
    const key = `${target.table}.${target.column}`;
    const matches = additions.filter((addition) => addition.key === key);
    if (matches.length === 0) {
      violations.push({
        manifest: manifest.name,
        file: '<manifest-sql>',
        kind: 'unproven-non-null-column-add',
        statement: key,
        reason: `${key} has no matching ALTER TABLE ADD COLUMN statement`,
      });
    } else if (matches.length > 1) {
      violations.push({
        manifest: manifest.name,
        file: '<manifest-sql>',
        kind: 'duplicate-non-null-column-add',
        statement: key,
        reason: `${key} must have exactly one ALTER TABLE ADD COLUMN statement`,
      });
    }
  }

  return violations;
}

function parseAlterTableAddColumn(statement) {
  const withoutTerminator = statement.replace(/;\s*$/, '').trim();
  const statementMatch = withoutTerminator.match(
    /^ALTER\s+TABLE\s+(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))\s+ADD\s+COLUMN\s+([\s\S]+)$/i
  );
  if (!statementMatch) {
    return null;
  }

  const table = statementMatch[1] ?? statementMatch[2];
  let remainder = statementMatch[3].trim();
  let ifNotExists = false;
  if (/^IF\b/i.test(remainder)) {
    const guardMatch = remainder.match(/^IF\s+NOT\s+EXISTS\s+([\s\S]+)$/i);
    if (!guardMatch) {
      return null;
    }
    ifNotExists = true;
    remainder = guardMatch[1].trim();
  }

  const columnMatch = remainder.match(/^(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))\s+([\s\S]+)$/i);
  if (!columnMatch) {
    return null;
  }

  const column = columnMatch[1] ?? columnMatch[2];
  return {
    table,
    column,
    key: `${table}.${column}`,
    ifNotExists,
    definition: columnMatch[3].trim(),
  };
}

function isSafeNonNullColumnAdd(addition) {
  if (
    !addition.ifNotExists ||
    /\b(?:ALTER\s+TABLE|ADD\s+COLUMN)\b/i.test(addition.definition) ||
    (addition.definition.match(/\bNOT\s+NULL\b/gi) ?? []).length !== 1 ||
    (addition.definition.match(/\bDEFAULT\b/gi) ?? []).length !== 1
  ) {
    return false;
  }

  const defaultMatch = addition.definition.match(
    /\bDEFAULT\s+([\s\S]+?)(?=\s+NOT\s+NULL\b|$)/i
  );
  return defaultMatch !== null && isProvenNonNullDefault(defaultMatch[1].trim());
}

function isProvenNonNullDefault(value) {
  return /^(?:true|false|[-+]?(?:\d+(?:\.\d+)?|\.\d+)|'(?:''|[^'])*'(?:\s*::\s*[a-z_][a-z0-9_]*(?:\([^)]*\))?)?|now\(\)|current_timestamp)$/i.test(
    value
  );
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

export function extractCreateTableNames(sql) {
  const withoutLineComments = sql.replace(/--.*$/gm, '');
  return Array.from(
    withoutLineComments.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi
    ),
    (match) => match[1]
  ).filter((tableName) => typeof tableName === 'string');
}

export async function auditManifest(client, manifest) {
  const missingTablePolicy = resolveMissingTablePolicy(manifest);
  const expectedTables = manifest.expectedTables ?? [];
  const dropObjects = manifest.dropObjects ?? [];
  const functionDefinitions = manifest.functionDefinitions ?? [];
  const tableNames = expectedTables.map((table) => table.name);
  if (tableNames.length === 0 && dropObjects.length === 0 && functionDefinitions.length === 0) {
    return {
      manifest: manifest.name,
      missingTablePolicy,
      action: ACTION_SKIP,
      objects: [],
    };
  }

  const objects = [];

  if (tableNames.length > 0) {
    const presentTables = await loadPresentTables(client, tableNames);
    const columns = await loadColumns(client, tableNames);
    const constraints = await loadConstraints(client, tableNames, expectedTables);
    const indexes = await loadIndexes(client, expectedTables);
    const triggers = await loadTriggers(client, expectedTables);

    for (const expectedTable of expectedTables) {
      const tableConstraints = constraints.filter(
        (constraint) => constraint.table_name === expectedTable.name
      );
      objects.push(
        await auditTable({
          client,
          expectedTable,
          tablePresent: presentTables.has(expectedTable.name),
          columns: columns.get(expectedTable.name) ?? new Map(),
          constraints: tableConstraints,
          indexes,
          triggers,
          nonNullColumnAdds: (manifest.applyPolicy?.allowNonNullColumnAdds ?? []).filter(
            (target) => target.table === expectedTable.name
          ),
          constraintReplacements: (manifest.applyPolicy?.allowConstraintReplacements ?? []).filter(
            (replacement) => replacement.table === expectedTable.name
          ),
          missingTablePolicy,
        })
      );
    }
  }

  if (functionDefinitions.length > 0) {
    objects.push(...(await auditFunctionDefinitions(client, functionDefinitions, missingTablePolicy)));
  }

  if (dropObjects.length > 0) {
    objects.push(...(await auditDropObjects(client, dropObjects)));
  }

  return {
    manifest: manifest.name,
    missingTablePolicy,
    action: summarizeAction(objects.map((object) => object.action)),
    objects,
  };
}

/**
 * WP-L3 T-A5: pg_proc-sourced function-body audit, the sibling of the
 * per-table trigger wiring audit below. Function DDL cannot ride the
 * additive-safe automated apply path, so any drift is humanReviewRequired:
 * ACTION_REFUSE_FOR_HUMAN until the operator reconciles manually, ACTION_SKIP
 * only once the live pg_get_functiondef body matches the manifest pin.
 */
async function auditFunctionDefinitions(client, functionDefinitions, missingTablePolicy) {
  const rows = await loadFunctions(
    client,
    functionDefinitions.map((functionDefinition) => functionDefinition.name)
  );

  return functionDefinitions.map((functionDefinition) => {
    const matches = rows.filter(
      (row) => row.proname === pgIdentifier(functionDefinition.name)
    );
    const deltas = [];
    if (matches.length === 0) {
      deltas.push({
        kind: 'missing-function',
        name: functionDefinition.name,
        additiveSafe: false,
        humanReviewRequired: true,
      });
    } else if (matches.length > 1) {
      deltas.push({
        kind: 'function-overload-ambiguous',
        name: functionDefinition.name,
        additiveSafe: false,
        humanReviewRequired: true,
      });
    } else if (
      !definitionMatches(matches[0].definition, functionDefinition.expectedDefinition)
    ) {
      deltas.push({
        kind: 'function-definition-mismatch',
        name: functionDefinition.name,
        expected: functionDefinition.expectedDefinition,
        actual: matches[0].definition,
        additiveSafe: false,
        humanReviewRequired: true,
      });
    }

    return {
      table: `function:${functionDefinition.name}`,
      present: matches.length > 0,
      populated: false,
      deltas,
      action: decideObjectAction({
        tablePresent: true,
        deltas,
        populated: false,
        missingTablePolicy,
      }),
    };
  });
}

async function loadFunctions(client, functionNames) {
  if (functionNames.length === 0) return [];
  const lookupNames = functionNames.map(pgIdentifier);

  const result = await client.query(
    `
      SELECT p.proname, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::text[])
    `,
    [lookupNames]
  );
  return result.rows;
}

async function loadTriggers(client, expectedTables) {
  const triggerNames = expectedTables.flatMap((table) =>
    (table.triggerDefinitions ?? []).map((triggerDefinition) => triggerDefinition.name)
  );
  if (triggerNames.length === 0) return [];
  const lookupNames = triggerNames.map(pgIdentifier);
  const tableNames = expectedTables
    .filter((table) => (table.triggerDefinitions ?? []).length > 0)
    .map((table) => table.name);

  const result = await client.query(
    `
      SELECT
        c.relname AS table_name,
        t.tgname,
        t.tgenabled,
        pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND c.relname = ANY($1::text[])
        AND t.tgname = ANY($2::text[])
    `,
    [tableNames, lookupNames]
  );
  return result.rows;
}

// Extra-objects audit: a dropObject PRESENT on the target means the manifest
// still has work (APPLY); absent means done (SKIP). The post-apply re-audit
// therefore verifies drops through the same must-be-SKIP gate as creates.
async function auditDropObjects(client, dropObjects) {
  const indexNames = dropObjects.filter((drop) => drop.kind === 'index').map((drop) => drop.name);
  const constraintDrops = dropObjects.filter((drop) => drop.kind === 'constraint');

  const presentIndexes = await loadPresentDropIndexes(client, indexNames);
  const presentConstraints = await loadPresentDropConstraints(client, constraintDrops);

  return dropObjects.map((drop) => {
    const present =
      drop.kind === 'index' ? presentIndexes.has(drop.name) : presentConstraints.has(drop.name);
    return {
      table: drop.table ?? drop.name,
      present,
      populated: false,
      deltas: present
        ? [{ kind: 'extra-object-present', name: drop.name, additiveSafe: true }]
        : [],
      action: present ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
    };
  });
}

async function loadPresentDropIndexes(client, names) {
  if (names.length === 0) return new Set();
  const result = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [names]
  );
  return new Set(result.rows.map((row) => row.indexname));
}

async function loadPresentDropConstraints(client, constraintDrops) {
  if (constraintDrops.length === 0) return new Set();
  const result = await client.query(
    `
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
        AND con.conname = ANY($2::text[])
    `,
    [constraintDrops.map((drop) => drop.table), constraintDrops.map((drop) => drop.name)]
  );
  return new Set(result.rows.map((row) => row.conname));
}

export function decideObjectAction({ tablePresent, deltas, populated, missingTablePolicy }) {
  if (deltas.some((delta) => delta.humanReviewRequired === true)) {
    return ACTION_REFUSE_FOR_HUMAN;
  }

  if (!tablePresent) {
    if (missingTablePolicy === MISSING_TABLE_POLICY_EXISTING_REQUIRED) {
      return ACTION_REFUSE_FOR_HUMAN;
    }
    return ACTION_APPLY_MISSING_DDL;
  }

  if (deltas.length === 0) {
    return ACTION_SKIP;
  }

  const hasNonAdditiveDelta = deltas.some((delta) => delta.additiveSafe === false);
  if (hasNonAdditiveDelta && populated) {
    return ACTION_REFUSE_FOR_HUMAN;
  }

  return ACTION_APPLY_MISSING_DDL;
}

export function formatAuditReport({ identity, privilegePrecheck, audits, apply }) {
  const lines = [
    `Target database: ${identity.database} user=${identity.user}`,
    `Mode: ${apply ? 'apply' : 'audit-only'}`,
    `Privilege precheck: database_create=${privilegePrecheck.canCreateDatabaseObjects} schema_create=${privilegePrecheck.canCreatePublicSchemaObjects} extension_create=${privilegePrecheck.canCreateExtension}`,
    '',
  ];

  for (const audit of audits) {
    lines.push(
      `${audit.manifest}: ${audit.action} (missingTablePolicy=${audit.missingTablePolicy ?? MISSING_TABLE_POLICY_CREATE_OR_REPAIR})`
    );
    for (const object of audit.objects) {
      const deltaSummary =
        object.deltas.length === 0
          ? 'shape-ok'
          : object.deltas.map((delta) => delta.name).join(', ');
      lines.push(`  ${object.table}: ${object.action} (${deltaSummary})`);
    }
  }

  return lines.join('\n');
}

export async function readDatabaseIdentity(client) {
  const result = await client.query(
    `SELECT current_database() AS database, current_user AS "user", inet_server_addr()::text AS host`
  );
  const row = result.rows[0] ?? {};
  return {
    database: String(row.database ?? ''),
    user: String(row.user ?? ''),
    host: row.host === null || row.host === undefined ? null : String(row.host),
  };
}

export function assertExpectedDatabase(identity, expectedDatabase) {
  if (!expectedDatabase) return;
  if (identity.database !== expectedDatabase) {
    throw new ReconcileError(
      `Target database identity mismatch: expected ${expectedDatabase}, got ${identity.database}`,
      {
        kind: 'database-identity-mismatch',
        expectedDatabase,
        actualDatabase: identity.database,
      }
    );
  }
}

export async function precheckPrivileges(client) {
  const result = await client.query(`
    SELECT
      has_database_privilege(current_database(), 'CREATE') AS "canCreateDatabaseObjects",
      has_schema_privilege('public', 'CREATE') AS "canCreatePublicSchemaObjects",
      has_database_privilege(current_database(), 'CREATE') AS "canCreateExtension"
  `);
  const row = result.rows[0] ?? {};
  return {
    canCreateDatabaseObjects: row.canCreateDatabaseObjects === true,
    canCreatePublicSchemaObjects: row.canCreatePublicSchemaObjects === true,
    canCreateExtension: row.canCreateExtension === true,
  };
}

export function assertApplyPrivileges(privilegePrecheck) {
  const missing = Object.entries(privilegePrecheck)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new ReconcileError(`Target role lacks required DDL privileges: ${missing.join(', ')}`, {
      kind: 'missing-privileges',
      missing,
    });
  }
}

export async function runReconciliation({
  client,
  manifests,
  rootDir = repoRoot,
  apply = false,
  expectedDatabase = null,
  stdout = process.stdout,
  capability = null,
}) {
  const identity = await readDatabaseIdentity(client);
  assertExpectedDatabase(identity, expectedDatabase);
  const privilegePrecheck = await precheckPrivileges(client);
  if (apply) {
    assertApplyPrivileges(privilegePrecheck);
  }

  const preparedManifests = [];
  for (const manifest of manifests) {
    const sqlFiles = await readManifestSql(manifest, rootDir);
    validateManifestSql(manifest, sqlFiles);
    validateDropObjects(manifest);
    const manifestDropStatements = dropStatements(manifest);
    preparedManifests.push({
      manifest,
      sqlFiles,
      checksum: manifestChecksum(manifest, sqlFiles),
      statementHashes: statementHashes(sqlFiles, manifestDropStatements),
      dropStatements: manifestDropStatements,
    });
  }

  const audits = [];
  for (const prepared of preparedManifests) {
    audits.push(await auditManifest(client, prepared.manifest));
  }

  stdout.write(`${formatAuditReport({ identity, privilegePrecheck, audits, apply })}\n`);

  if (!apply) {
    stdout.write('\nAudit-only mode. Re-run with --apply --yes to apply the manifests.\n');
    return { ok: true, applied: [], audits };
  }

  if (capability) {
    await acquireAdvisoryLock(client);
    try {
      const lockTimeAudits = [];
      for (const prepared of preparedManifests) {
        lockTimeAudits.push(await auditManifest(client, prepared.manifest));
      }
      const selected = selectExact0053G3ReleaseGateHardeningApply({
        preparedManifests,
        audits: lockTimeAudits,
        target: capability,
      });
      await assertPrepared0053G3ReleaseGateHardeningCapability({
        capability,
        prepared: selected,
        rootDir,
      });
      if (await hasCommittedManifestName(client, capability.manifestName)) {
        throw new ReconcileError('0053 capability target has already committed', {
          kind: 'committed-0053-capability-repeat',
        });
      }
      stdout.write(`${buildLockTimeApplyVectorV1({
        preparedManifests,
        audits: lockTimeAudits,
        target: capability,
      })}\n`);
      await setApplyTimeouts(client);
      await ensureLedger(client);
      await applyPreparedManifest({ client, prepared: selected, identity, stdout });
      return { ok: true, applied: [selected.manifest.name], audits: lockTimeAudits };
    } finally {
      await releaseAdvisoryLock(client);
    }
  }

  const auditByManifest = new Map(audits.map((audit) => [audit.manifest, audit]));
  const refused = audits.filter((audit) => audit.action === ACTION_REFUSE_FOR_HUMAN);
  if (refused.length > 0) {
    throw new ReconcileError(
      `Refusing apply; ${refused.map((audit) => audit.manifest).join(', ')} need human review`,
      {
        kind: 'human-review-required',
        audits: refused,
      }
    );
  }

  const manifestsNeedingApply = preparedManifests.filter(
    (prepared) => auditByManifest.get(prepared.manifest.name)?.action === ACTION_APPLY_MISSING_DDL
  );
  if (manifestsNeedingApply.length === 0) {
    stdout.write('\nAll manifest shapes already match; no DDL applied.\n');
    return { ok: true, applied: [], audits };
  }

  await acquireAdvisoryLock(client);
  const applied = [];
  try {
    await setApplyTimeouts(client);
    await ensureLedger(client);

    for (const prepared of manifestsNeedingApply) {
      if (await hasCommittedLedger(client, prepared.manifest.name, prepared.checksum)) {
        stdout.write(
          `\nSkipping ${prepared.manifest.name}: committed ledger row already exists.\n`
        );
        continue;
      }

      await applyPreparedManifest({ client, prepared, identity, stdout });
      applied.push(prepared.manifest.name);
    }
  } finally {
    await releaseAdvisoryLock(client);
  }

  return { ok: true, applied, audits };
}

export async function runReconcileCli({
  argv = process.argv.slice(2),
  env = process.env,
  clientFactory = ({ connectionString }) => new Client({ connectionString }),
} = {}) {
  const options = parseReconcileArgs(argv, env);
  assertApplyConfirmation(options);
  const capability = options.apply
    ? await prepare0053G3ReleaseGateHardeningCapability()
    : null;
  assertDirectDatabaseUrl(env.DATABASE_URL);

  const client = clientFactory({ connectionString: env.DATABASE_URL });
  try {
    await client.connect();
    const manifests = capability?.manifests ?? (await loadManifests(options.manifestDir));
    await runReconciliation({
      client,
      manifests,
      apply: options.apply,
      expectedDatabase: options.expectedDatabase,
      capability: capability ?? null,
    });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyDrizzlePushOutput({
      status: 0,
      dbErrorDetected: matchesDbError(message),
    });
    console.error(`[reconcile-prod-schema] ${message}`);
    if (!classification.ok) {
      console.error(`[reconcile-prod-schema] ${classification.message}`);
    }
    return 1;
  } finally {
    await client.end().catch(() => {});
  }
}

async function auditTable({
  client,
  expectedTable,
  tablePresent,
  columns,
  constraints,
  indexes,
  triggers = [],
  nonNullColumnAdds,
  constraintReplacements,
  missingTablePolicy,
}) {
  const deltas = [];
  const indexTableMismatches = findIndexTableMismatches(expectedTable, indexes);
  deltas.push(...indexTableMismatches);
  // WP-L3 T-A5: trigger wiring deltas are computed BEFORE the missing-table
  // early return so the pre-reconciliation state (table and trigger both
  // absent) surfaces as ACTION_REFUSE_FOR_HUMAN, never as an automated
  // create-and-apply — trigger DDL cannot ride the additive-safe apply path
  // (DROP TRIGGER is an unknown drop for prod-schema-apply-policy.mjs).
  deltas.push(...triggerDefinitionDeltas(expectedTable, triggers));

  if (!tablePresent) {
    deltas.push({ kind: 'missing-table', name: expectedTable.name, additiveSafe: true });
    const action = decideObjectAction({
      tablePresent,
      deltas,
      populated: false,
      missingTablePolicy,
    });
    return {
      table: expectedTable.name,
      present: false,
      populated: false,
      deltas,
      action,
    };
  }

  for (const expectedColumn of expectedTable.columns ?? []) {
    const actualColumn = columns.get(expectedColumn.name);
    if (!actualColumn) {
      const allowNonNullAdd = nonNullColumnAdds.some(
        (target) => target.column === expectedColumn.name
      );
      deltas.push({
        kind: 'missing-column',
        name: `${expectedTable.name}.${expectedColumn.name}`,
        additiveSafe: expectedColumn.nullable !== false || allowNonNullAdd,
      });
      continue;
    }

    if (
      expectedColumn.type &&
      normalizeColumnType(actualColumn) !== normalizeExpectedType(expectedColumn.type)
    ) {
      deltas.push({
        kind: 'column-type-mismatch',
        name: `${expectedTable.name}.${expectedColumn.name}`,
        expected: expectedColumn.type,
        actual: normalizeColumnType(actualColumn),
        additiveSafe: false,
      });
    }

    if (
      typeof expectedColumn.nullable === 'boolean' &&
      actualColumn.nullable !== expectedColumn.nullable
    ) {
      const widensToNullable = actualColumn.nullable === false && expectedColumn.nullable === true;
      deltas.push({
        kind: 'column-nullability-mismatch',
        name: `${expectedTable.name}.${expectedColumn.name}`,
        expected: expectedColumn.nullable,
        actual: actualColumn.nullable,
        additiveSafe: widensToNullable,
      });
    }
  }

  const missingSentinels = findMissingSentinels({
    sentinels: {
      constraints: expectedTable.constraints ?? [],
      indexes: expectedTable.indexes ?? [],
    },
    constraintRows: constraints,
    indexRows: indexes.filter((row) => row.tablename === expectedTable.name),
  });

  for (const name of missingSentinels.constraints) {
    deltas.push({ kind: 'missing-constraint', name, additiveSafe: true });
  }

  for (const name of missingSentinels.indexes) {
    deltas.push({ kind: 'missing-index', name, additiveSafe: true });
  }

  for (const replacement of constraintReplacements) {
    const constraint = constraints.find((row) => row.conname === pgIdentifier(replacement.name));
    if (
      constraint &&
      !constraintDefinitionMatches(constraint.definition, replacement.expectedDefinition)
    ) {
      deltas.push({
        kind: 'constraint-definition-mismatch',
        name: replacement.name,
        expected: replacement.expectedDefinition,
        actual: constraint.definition,
        additiveSafe: true,
      });
    }
  }

  for (const constraintDefinition of expectedTable.constraintDefinitions ?? []) {
    const constraint = constraints.find(
      (row) => row.conname === pgIdentifier(constraintDefinition.name)
    );
    if (
      constraint &&
      !definitionMatches(constraint.definition, constraintDefinition.expectedDefinition)
    ) {
      deltas.push({
        kind: 'constraint-definition-mismatch',
        name: constraintDefinition.name,
        expected: constraintDefinition.expectedDefinition,
        actual: constraint.definition,
        additiveSafe: false,
        humanReviewRequired: true,
      });
    }
  }

  for (const indexDefinition of expectedTable.indexDefinitions ?? []) {
    const index = indexes.find(
      (row) =>
        row.indexname === pgIdentifier(indexDefinition.name) && row.tablename === expectedTable.name
    );
    if (index && !definitionMatches(index.indexdef, indexDefinition.expectedDefinition)) {
      deltas.push({
        kind: 'index-definition-mismatch',
        name: indexDefinition.name,
        expected: indexDefinition.expectedDefinition,
        actual: index.indexdef,
        additiveSafe: false,
      });
    }
  }

  const requiresHumanReview = deltas.some((delta) => delta.humanReviewRequired === true);
  const populated =
    !requiresHumanReview &&
    deltas.some((delta) => delta.additiveSafe === false) &&
    (await hasRows(client, expectedTable.name));
  const action = decideObjectAction({ tablePresent, deltas, populated, missingTablePolicy });

  return {
    table: expectedTable.name,
    present: true,
    populated,
    deltas,
    action,
  };
}

async function loadPresentTables(client, tableNames) {
  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );
  return new Set(result.rows.map((row) => row.table_name));
}

async function loadColumns(client, tableNames) {
  const result = await client.query(
    `
      SELECT table_name, column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );
  const columns = new Map();
  for (const row of result.rows) {
    const tableColumns = columns.get(row.table_name) ?? new Map();
    tableColumns.set(row.column_name, {
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === 'YES',
    });
    columns.set(row.table_name, tableColumns);
  }
  return columns;
}

async function loadConstraints(client, tableNames, expectedTables) {
  const constraintNames = expectedTables.flatMap((table) => table.constraints ?? []);
  if (constraintNames.length === 0) return [];
  const lookupNames = constraintNames.map(pgIdentifier);

  const result = await client.query(
    `
      SELECT
        rel.relname AS table_name,
        c.conname,
        pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND rel.relname = ANY($1::text[])
        AND c.conname = ANY($2::text[])
    `,
    [tableNames, lookupNames]
  );
  return result.rows;
}

function constraintDefinitionMatches(actualDefinition, expectedDefinition) {
  if (typeof actualDefinition !== 'string') return false;
  const normalizedDefinition = actualDefinition.toLowerCase();
  if (
    expectedDefinition.requiredFragments.some(
      (fragment) => !normalizedDefinition.includes(fragment.toLowerCase())
    )
  ) {
    return false;
  }

  const actualLiterals = extractSqlStringLiterals(actualDefinition).sort();
  const expectedLiterals = [...expectedDefinition.stringLiterals].sort();
  return (
    actualLiterals.length === expectedLiterals.length &&
    actualLiterals.every((literal, index) => literal === expectedLiterals[index])
  );
}

function definitionMatches(actualDefinition, expectedDefinition) {
  if (typeof actualDefinition !== 'string') return false;

  const normalizedDefinition = normalizeSqlDefinition(actualDefinition);
  if (normalizedDefinition !== normalizeSqlDefinition(expectedDefinition.exactDefinition)) {
    return false;
  }

  let searchFrom = 0;
  for (const fragment of expectedDefinition.orderedFragments) {
    const normalizedFragment = normalizeSqlDefinition(fragment);
    const position = normalizedDefinition.indexOf(normalizedFragment, searchFrom);
    if (position === -1) return false;
    searchFrom = position + normalizedFragment.length;
  }

  const actualLiterals = extractSqlStringLiterals(actualDefinition).sort();
  const expectedLiterals = [...expectedDefinition.stringLiterals].sort();
  return (
    actualLiterals.length === expectedLiterals.length &&
    actualLiterals.every((literal, index) => literal === expectedLiterals[index])
  );
}

/**
 * WP-L3 T-A5: pg_trigger/pg_get_triggerdef wiring audit, analogous to
 * 0034's indexDefinitions. Every discrepancy — missing trigger, disabled
 * trigger (tgenabled <> 'O'), or drifted definition — is humanReviewRequired,
 * so the manifest audits ACTION_REFUSE_FOR_HUMAN until the operator applies
 * the journaled migration manually, and ACTION_SKIP only once the live
 * definition matches the manifest pin exactly.
 */
function triggerDefinitionDeltas(expectedTable, triggers) {
  const deltas = [];
  for (const triggerDefinition of expectedTable.triggerDefinitions ?? []) {
    const trigger = triggers.find(
      (row) =>
        row.tgname === pgIdentifier(triggerDefinition.name) &&
        row.table_name === expectedTable.name
    );
    if (!trigger) {
      deltas.push({
        kind: 'missing-trigger',
        name: triggerDefinition.name,
        additiveSafe: false,
        humanReviewRequired: true,
      });
      continue;
    }
    if (trigger.tgenabled !== 'O') {
      deltas.push({
        kind: 'trigger-disabled',
        name: triggerDefinition.name,
        actual: trigger.tgenabled,
        additiveSafe: false,
        humanReviewRequired: true,
      });
      continue;
    }
    if (!definitionMatches(trigger.definition, triggerDefinition.expectedDefinition)) {
      deltas.push({
        kind: 'trigger-definition-mismatch',
        name: triggerDefinition.name,
        expected: triggerDefinition.expectedDefinition,
        actual: trigger.definition,
        additiveSafe: false,
        humanReviewRequired: true,
      });
    }
  }
  return deltas;
}

function findIndexTableMismatches(expectedTable, indexes) {
  const expectedNames = new Set((expectedTable.indexes ?? []).map(pgIdentifier));
  return indexes
    .filter(
      (index) =>
        expectedNames.has(pgIdentifier(index.indexname)) && index.tablename !== expectedTable.name
    )
    .map((index) => ({
      kind: 'index-table-mismatch',
      name: index.indexname,
      expectedTable: expectedTable.name,
      actualTable: index.tablename,
      additiveSafe: false,
      humanReviewRequired: true,
    }));
}

function normalizeSqlDefinition(definition) {
  return definition
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*(::|<>|<=|>=|=)\s*/g, '$1')
    .replace(/\s*([(),.;])\s*/g, '$1')
    .trim();
}

function extractSqlStringLiterals(definition) {
  return [...definition.matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[1].replace(/''/g, "'"));
}

async function loadIndexes(client, expectedTables) {
  const indexNames = expectedTables.flatMap((table) => table.indexes ?? []);
  if (indexNames.length === 0) return [];
  const lookupNames = indexNames.map(pgIdentifier);

  const result = await client.query(
    `
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
    `,
    [lookupNames]
  );
  return result.rows;
}

async function hasRows(client, tableName) {
  assertSafeIdentifier(tableName);
  const result = await client.query(
    `SELECT EXISTS (SELECT 1 FROM "${tableName}" LIMIT 1) AS populated`
  );
  return result.rows[0]?.populated === true;
}

function summarizeAction(actions) {
  if (actions.includes(ACTION_REFUSE_FOR_HUMAN)) return ACTION_REFUSE_FOR_HUMAN;
  if (actions.includes(ACTION_APPLY_MISSING_DDL)) return ACTION_APPLY_MISSING_DDL;
  return ACTION_SKIP;
}

export async function acquireAdvisoryLock(client) {
  const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [
    RECONCILE_LOCK_ID,
  ]);
  if (result.rows[0]?.acquired !== true) {
    throw new ReconcileError('Another prod-schema reconciliation run holds the advisory lock', {
      kind: 'advisory-lock-contended',
    });
  }
}

export async function releaseAdvisoryLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [RECONCILE_LOCK_ID]);
}

export async function setApplyTimeouts(client) {
  await client.query("SET lock_timeout = '5s'");
  await client.query("SET statement_timeout = '5min'");
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${LEDGER_TABLE}" (
      "id" bigserial PRIMARY KEY,
      "manifest_name" text NOT NULL,
      "manifest_checksum" text NOT NULL,
      "file_checksums" jsonb NOT NULL,
      "statement_hashes" jsonb NOT NULL,
      "target_database" text NOT NULL,
      "target_user" text NOT NULL,
      "applied_by" text NOT NULL,
      "started_at" timestamp with time zone NOT NULL DEFAULT now(),
      "committed_at" timestamp with time zone,
      "status" text NOT NULL,
      CONSTRAINT "${LEDGER_TABLE}_status_check" CHECK ("status" IN ('started','committed'))
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "${LEDGER_TABLE}_manifest_committed_idx"
    ON "${LEDGER_TABLE}" ("manifest_name", "manifest_checksum")
    WHERE "committed_at" IS NOT NULL
  `);
}

async function hasCommittedLedger(client, manifestName, checksum) {
  const result = await client.query(
    `
      SELECT 1
      FROM "${LEDGER_TABLE}"
      WHERE "manifest_name" = $1
        AND "manifest_checksum" = $2
        AND "committed_at" IS NOT NULL
      LIMIT 1
    `,
    [manifestName, checksum]
  );
  return result.rowCount > 0;
}

async function hasCommittedManifestName(client, manifestName) {
  const ledger = await client.query(`SELECT to_regclass('public.${LEDGER_TABLE}') AS ledger`);
  if (ledger.rows[0]?.ledger === null || ledger.rows[0]?.ledger === undefined) {
    return false;
  }
  const result = await client.query(
    `
      SELECT 1
      FROM "${LEDGER_TABLE}"
      WHERE "manifest_name" = $1
        AND "committed_at" IS NOT NULL
      LIMIT 1
    `,
    [manifestName]
  );
  return result.rowCount > 0;
}

async function applyPreparedManifest({ client, prepared, identity, stdout }) {
  const fileChecksums = prepared.sqlFiles.map((file) => ({
    path: file.path,
    checksum: file.checksum,
  }));
  const appliedBy = process.env.USER || process.env.USERNAME || 'unknown';
  let ledgerId;

  await client.query('BEGIN');
  try {
    const ledger = await client.query(
      `
        INSERT INTO "${LEDGER_TABLE}"
          ("manifest_name", "manifest_checksum", "file_checksums", "statement_hashes",
           "target_database", "target_user", "applied_by", "status")
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, 'started')
        RETURNING "id"
      `,
      [
        prepared.manifest.name,
        prepared.checksum,
        JSON.stringify(fileChecksums),
        JSON.stringify(prepared.statementHashes),
        identity.database,
        identity.user,
        appliedBy,
      ]
    );
    ledgerId = ledger.rows[0].id;

    for (const file of prepared.sqlFiles) {
      stdout.write(`\nApplying ${file.path} (${file.statements.length} statements)\n`);
      for (const statement of file.statements) {
        await client.query(statement);
      }
    }

    if (prepared.dropStatements.length > 0) {
      stdout.write(
        `\nApplying ${prepared.dropStatements.length} dropObjects statements for ${prepared.manifest.name}\n`
      );
      for (const statement of prepared.dropStatements) {
        await client.query(statement);
      }
    }

    const after = await auditManifest(client, prepared.manifest);
    if (after.action !== ACTION_SKIP) {
      // The CLI surfaces only error.message - the failing deltas must live IN
      // the message or the operator gets no diagnosis (s8.1 slice 4a lesson).
      const failingObjects = after.objects
        .filter((object) => object.deltas.length > 0 || object.action !== ACTION_SKIP)
        .map((object) => `${object.table}: ${JSON.stringify(object.deltas)}`)
        .join('; ');
      throw new ReconcileError(
        `Post-apply shape audit failed for ${prepared.manifest.name} - ${failingObjects}`,
        {
          kind: 'post-apply-audit-failed',
          audit: after,
        }
      );
    }

    await client.query(
      `
        UPDATE "${LEDGER_TABLE}"
        SET "committed_at" = now(), "status" = 'committed'
        WHERE "id" = $1
      `,
      [ledgerId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function normalizeColumnType(column) {
  const dataType = String(column.dataType ?? '').toLowerCase();
  const udtName = String(column.udtName ?? '').toLowerCase();
  if (dataType === 'user-defined') return udtName;
  if (dataType === 'character varying') return 'varchar';
  if (dataType === 'timestamp with time zone') return 'timestamptz';
  if (dataType === 'timestamp without time zone') return 'timestamp';
  if (dataType === 'integer') return 'integer';
  if (dataType === 'numeric') return 'numeric';
  return dataType;
}

function normalizeExpectedType(type) {
  return String(type).toLowerCase();
}

function assertSafeIdentifier(identifier) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new ReconcileError(`Unsafe SQL identifier: ${identifier}`, {
      kind: 'unsafe-identifier',
      identifier,
    });
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runReconcileCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
