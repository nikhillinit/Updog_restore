#!/usr/bin/env tsx
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeMetrics } from '../../server/services/lp-reporting/metrics-engine';
import {
  GoldenMetricFixtureSchema,
  type GoldenMetricFixture,
} from '../../tests/unit/golden/lp-reporting/_schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const fixtureDir = join(root, 'tests/fixtures/golden/lp-metrics');

const lock = process.env.LOCK_GOLDENS === '1';

if (lock && process.env.CI && process.env.ALLOW_GOLDEN_LOCK_IN_CI !== '1') {
  console.error(
    'Refusing to lock golden fixtures in CI. Set ALLOW_GOLDEN_LOCK_IN_CI=1 to override.'
  );
  process.exit(1);
}

let changed = false;

function render(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function deterministicSnapshot(fixture: GoldenMetricFixture) {
  const { lock: fixtureLock, ...rest } = fixture;
  if (!fixtureLock) return rest;

  return {
    ...rest,
    lock: {
      inputs_hash: fixtureLock.inputs_hash,
      diagnostics: fixtureLock.diagnostics,
    },
  };
}

function buildNextFixture(fixture: GoldenMetricFixture, lockedAt: string): GoldenMetricFixture {
  const out = computeMetrics(fixture.input);

  return {
    ...fixture,
    expected: {
      ...fixture.expected,
      engine_decimal_strings: {
        dpi: out.results.dpi,
        rvpi: out.results.rvpi,
        tvpi: out.results.tvpi,
        netIrr: out.results.netIrr,
        grossIrr: out.results.grossIrr,
        contributionsTotal: out.results.contributionsTotal,
        distributionsTotal: out.results.distributionsTotal,
        currentNav: out.results.currentNav,
      },
    },
    lock: {
      locked_at: lockedAt,
      inputs_hash: out.inputsHash,
      diagnostics: out.diagnostics,
    },
  };
}

for (const file of readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  const path = join(fixtureDir, file);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const fixture = GoldenMetricFixtureSchema.parse(parsed);
  const preserved = buildNextFixture(fixture, fixture.lock?.locked_at ?? new Date().toISOString());
  const deterministicChanged =
    render(deterministicSnapshot(fixture)) !== render(deterministicSnapshot(preserved));
  const next = deterministicChanged
    ? buildNextFixture(fixture, new Date().toISOString())
    : preserved;

  const before = render(fixture);
  const after = render(next);

  if (before !== after) {
    changed = true;
    if (lock) {
      writeFileSync(path, after);
      console.log(`locked ${file}`);
    } else {
      console.log(`would update ${file}`);
    }
  }
}

if (changed && !lock) {
  console.error('Golden fixtures are not locked. Re-run with LOCK_GOLDENS=1 to update snapshots.');
  process.exitCode = 1;
}
