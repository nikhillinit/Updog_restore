#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ACTION_SKIP, isPoolerUrl } from './reconcile-prod-schema.mjs';

const SKIP_MESSAGE = 'schema audit skipped: no direct DATABASE_URL';

export async function runSchemaAuditPreflight({
  databaseUrl,
  manifestDir = 'scripts/prod-schema-manifests',
  expectedDb = null,
  runReconcile,
} = {}) {
  if (!databaseUrl || databaseUrl === 'memory://' || isPoolerUrl(databaseUrl)) {
    return { status: 'skipped', ok: true, message: SKIP_MESSAGE };
  }

  const args = ['scripts/reconcile-prod-schema.mjs', '--manifest-dir', manifestDir];
  if (expectedDb) {
    args.push('--expect-db', expectedDb);
  }

  assertAuditOnlyArgs(args);

  const run =
    runReconcile ??
    ((reconcileArgs) =>
      defaultRunReconcile(reconcileArgs, {
        databaseUrl,
        expectedDb,
      }));
  const result = run(args);
  const auditActions = parseAuditActions(result.stdout ?? '');
  const driftActions = auditActions.filter((audit) => audit.action !== ACTION_SKIP);
  const ok = result.code === 0 && driftActions.length === 0;

  return {
    status: 'audited',
    ok,
    message: `schema audit ${ok ? 'passed' : 'reported drift'} (reconcile audit-only)`,
    code: result.code,
    auditActions,
  };
}

export function parseAuditActions(stdout) {
  const actions = [];
  const actionPattern = /^([^\s:][^:]*):\s+(SKIP|APPLY-MISSING-DDL|REFUSE-FOR-HUMAN)\s*$/gm;
  for (const match of stdout.matchAll(actionPattern)) {
    actions.push({
      manifest: match[1],
      action: match[2],
    });
  }
  return actions;
}

function assertAuditOnlyArgs(args) {
  if (args.includes('--apply') || args.includes('--yes')) {
    throw new Error('schema audit preflight invariant failed: reconcile args must remain audit-only');
  }
}

function defaultRunReconcile(args, { databaseUrl, expectedDb } = {}) {
  const result = spawnSync('node', args, {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ...(expectedDb ? { UPDOG_EXPECTED_DATABASE: expectedDb } : {}),
    },
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

const isCliInvocation = process.argv[1] === fileURLToPath(import.meta.url);

if (isCliInvocation) {
  const result = await runSchemaAuditPreflight({
    databaseUrl: process.env.DATABASE_URL,
    manifestDir: process.env.UPDOG_SCHEMA_MANIFEST_DIR ?? 'scripts/prod-schema-manifests',
    expectedDb: process.env.UPDOG_EXPECTED_DATABASE ?? null,
  });
  console.log(result.message);
  process.exit(result.status === 'skipped' ? 0 : result.ok ? 0 : 1);
}
