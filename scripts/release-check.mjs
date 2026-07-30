#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import console from 'node:console';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const clientSurfaceTests = [
  'tests/unit/pages/fund-scenario-workspace.test.tsx',
  'tests/unit/components/ScenarioEvidenceHeader.test.tsx',
  'tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx',
  'tests/unit/components/layout/sidebar-navigation.test.tsx',
  'tests/unit/app/route-perimeter-governance.test.tsx',
  'tests/unit/pages/fund-model-results.test.tsx',
  'tests/unit/app/auth-session-gate.test.tsx',
  'tests/unit/app/app-layout-logout.test.tsx',
  'tests/unit/auth-session.test.tsx',
  'tests/unit/install-auth-fetch.test.tsx',
];

const serverSurfaceTests = [
  'tests/unit/routes/fund-scenario-sets-route-contract.test.ts',
  'tests/unit/contract/fund-scenario-sets.test.ts',
  'tests/unit/phase3/fund-results-contract.test.ts',
  'tests/unit/phase3/fund-results-read-service.test.ts',
  'tests/unit/contract/fund-results-route.test.ts',
  'tests/unit/routes/backtesting.contract.test.ts',
  'tests/unit/queues/resolve-fund-id.test.ts',
  'tests/unit/routes/lp-api.contract.test.ts',
  'tests/unit/prod-schema-manifest-sentinels.test.ts',
  'tests/unit/mount-parity-migrations.test.ts',
  'tests/unit/reconcile-prod-schema.test.ts',
  'tests/unit/migration-drift-patches.test.ts',
  'tests/regressions/ci-unified-playwright-install.test.ts',
  'tests/unit/scripts/db-push.test.mjs',
  'tests/unit/auth/request-credentials.test.ts',
  'tests/unit/auth/csrf.test.ts',
  'tests/unit/auth/csrf-middleware.test.ts',
  'tests/unit/auth/cookie-auth-makeapp.test.ts',
  'tests/unit/routes/auth-login.test.ts',
  'tests/unit/openapi/auth-transport-contract.test.ts',
];

const releaseOwnedPaths = [
  'client/src/lib/auth-session.ts',
  'docs/superpowers/plans/2026-07-12-d4-cookie-session-csrf-handoff.md',
  'docs/release',
  'migrations',
  'shared/migrations',
  'scripts/prod-schema-manifests',
  'scripts/release-check.mjs',
  'scripts/run-gp-spine-e2e.mjs',
  'scripts/db-push.mjs',
  'scripts/db-push-core.mjs',
  'server/lib/auth/csrf.ts',
  'server/lib/auth/request-credentials.ts',
  'tests/helpers/browser-auth.ts',
  'tests/e2e/cookie-session-csrf.spec.ts',
  'tests/e2e/gp-decision-spine.spec.ts',
  'tests/integration/cookie-session-auth-runtime.test.ts',
  'tests/integration/fund-lifecycle-db.test.ts',
  'tests/integration/migration-drift.test.ts',
  'tests/integration/prod-schema-clone.test.ts',
  'tests/integration/prod-schema-reconcile-partial-drift.test.ts',
  'tests/unit/app/auth-session-gate.test.tsx',
  'tests/unit/app/app-layout-logout.test.tsx',
  'tests/unit/auth-session.test.tsx',
  'tests/unit/auth/cookie-auth-makeapp.test.ts',
  'tests/unit/auth/csrf-middleware.test.ts',
  'tests/unit/auth/csrf.test.ts',
  'tests/unit/auth/request-credentials.test.ts',
  'tests/unit/install-auth-fetch.test.tsx',
  'tests/unit/openapi/auth-transport-contract.test.ts',
  'vitest.config.testcontainers.ts',
];

function checkReleaseOwnedFilesTracked() {
  const result = spawnSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', ...releaseOwnedPaths],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );

  if (result.status !== 0) {
    return result.status ?? 1;
  }

  const untrackedReleaseFiles = result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (untrackedReleaseFiles.length === 0) {
    return 0;
  }

  console.error('[release:check] release-owned files are untracked:');
  for (const filePath of untrackedReleaseFiles) {
    console.error(`  - ${filePath}`);
  }
  console.error('[release:check] stage or commit release-owned files before claiming the gate');
  return 1;
}

const upstreamSharedSteps = [
  { name: 'TypeScript baseline', command: 'npm run check' },
  { name: 'Lint and guardrails', command: 'npm run lint' },
];

const releaseSurfaceSteps = [
  {
    name: 'Lean release client surface lock',
    command: ['cross-env TZ=UTC vitest run', ...clientSurfaceTests, '--project=client'].join(' '),
  },
  {
    name: 'Cookie-session browser lifecycle',
    command:
      'cross-env CI=1 TZ=UTC PORT=4199 playwright test tests/e2e/cookie-session-csrf.spec.ts --project=d4-auth',
  },
  {
    name: 'GP decision spine (E2E)',
    command: 'cross-env CI=1 TZ=UTC node scripts/run-gp-spine-e2e.mjs',
  },
  {
    name: 'Lean release server and CI surface lock',
    command: ['cross-env TZ=UTC vitest run', ...serverSurfaceTests, '--project=server'].join(' '),
  },
  {
    name: 'Cookie-auth runtime parity',
    command:
      'cross-env TZ=UTC vitest run -c vitest.config.int.ts tests/integration/cookie-session-auth-runtime.test.ts',
  },
];

const dbBackedSteps = [
  {
    name: 'Fund lifecycle DB proof',
    command:
      'cross-env TZ=UTC vitest run -c vitest.config.testcontainers.ts tests/integration/fund-lifecycle-db.test.ts',
  },
  {
    name: 'Migration drift guard',
    command:
      'cross-env TZ=UTC vitest run -c vitest.config.testcontainers.ts tests/integration/migration-drift.test.ts',
  },
  {
    name: 'Production schema clone proof',
    command:
      'cross-env TZ=UTC vitest run -c vitest.config.testcontainers.ts tests/integration/prod-schema-clone.test.ts',
  },
  {
    name: 'Production partial-drift reconciliation proof',
    command:
      'cross-env TZ=UTC vitest run -c vitest.config.testcontainers.ts tests/integration/prod-schema-reconcile-partial-drift.test.ts',
  },
  {
    name: 'Scenario release gate',
    command: 'npm run test:scenario-release-gate',
  },
];

const trailingSharedSteps = [
  { name: 'Core validation wrapper', command: 'npm run validate:core' },
  { name: 'Production build', command: 'npm run build' },
];

const repositoryIntegritySteps = [
  { name: 'Whitespace diff check', command: 'git diff --check HEAD --' },
  { name: 'Release-owned file tracking', run: checkReleaseOwnedFilesTracked },
];

export function validateReleaseCheckMode({ skipDbProof, reuseCiGates, ci }) {
  if (reuseCiGates && !skipDbProof) {
    throw new Error('--reuse-ci-gates requires --skip-db');
  }
  if (reuseCiGates && !ci) {
    throw new Error('--reuse-ci-gates requires CI=true');
  }
}

export function buildReleaseCheckSteps({ skipDbProof, reuseCiGates }) {
  return [
    ...(reuseCiGates ? [] : upstreamSharedSteps),
    ...releaseSurfaceSteps,
    ...(skipDbProof ? [] : dbBackedSteps),
    ...(reuseCiGates ? [] : trailingSharedSteps),
    ...repositoryIntegritySteps,
  ];
}

function executeSteps(steps, spawn = spawnSync) {
  for (const [index, step] of steps.entries()) {
    console.log(`[release:check] ${index + 1}/${steps.length}: ${step.name}`);

    if (step.run) {
      const status = step.run();
      if (status !== 0) {
        console.error(`[release:check] failed: ${step.name}`);
        return status;
      }
      continue;
    }

    const result = spawn(step.command, {
      env: process.env,
      shell: true,
      stdio: 'inherit',
    });

    if (result.error) {
      console.error(`[release:check] failed to run: ${step.command}`);
      console.error(result.error.message);
      return 1;
    }

    if (result.status !== 0) {
      console.error(`[release:check] failed: ${step.name}`);
      return result.status ?? 1;
    }
  }
  return 0;
}

function main(argv = process.argv.slice(2), env = process.env) {
  const skipDbProof = argv.includes('--skip-db') || env.UPDOG_RELEASE_CHECK_SKIP_DB === '1';
  const reuseCiGates = argv.includes('--reuse-ci-gates');
  validateReleaseCheckMode({ skipDbProof, reuseCiGates, ci: env.CI === 'true' });

  if (skipDbProof) {
    console.warn(
      '[release:check] skipping container-backed lifecycle proof; this is diagnostic only and is not release proof'
    );
  }

  const steps = buildReleaseCheckSteps({ skipDbProof, reuseCiGates });
  return executeSteps(steps);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath.toLowerCase() === modulePath.toLowerCase()) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
