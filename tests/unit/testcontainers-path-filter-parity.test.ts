import fs from 'node:fs';

import picomatch from 'picomatch';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';

import { TESTCONTAINERS_TEST_PATHS } from '../config/testcontainers-test-paths.mjs';

const PATH_FILTERS = '.github/path-filters.yml';
const TESTCONTAINERS_TEST_PATHS_MODULE = 'tests/config/testcontainers-test-paths.mjs';

const REQUIRED_TESTCONTAINERS_TRIGGER_SEAMS = [
  '.github/path-filters.yml',
  '.github/workflows/testcontainers-ci.yml',
  'vitest.config.testcontainers.ts',
  'tests/setup/global-setup.testcontainers.ts',
  'tests/helpers/testcontainers.ts',
  'tests/helpers/testcontainers-migration.ts',
  'tests/integration/helpers/run-drizzle-push.ts',
] as const;

interface PathFilters {
  schema_tests?: string[];
}

const REQUIRED_SCHEMA_TEST_SEAMS = [
  'shared/contracts/investment-ledger/position.contract.ts',
  'shared/contracts/investment-ledger/participation.contract.ts',
  'shared/schema/investment-ledger.ts',
  'shared/schema/investment-positions.ts',
  'shared/schema/vehicle-financing-participations.ts',
  'server/services/investment-ledger/position-conversion-service.ts',
  'server/services/investment-ledger/ledger-correction-service.ts',
  'server/routes/investment-ledger.ts',
  'server/routes/cohort-analysis.ts',
  'tests/integration/investment-ledger/position-conversion.pg.test.ts',
  'tests/integration/vehicle-financing-participations-real-pg.test.ts',
  'tests/integration/scenarios/company-scenario-create-persistence.test.ts',
] as const;

function schemaTestPatterns(): string[] {
  const filters = YAML.parse(fs.readFileSync(PATH_FILTERS, 'utf8')) as PathFilters;
  const patterns = filters.schema_tests ?? [];
  if (patterns.length === 0) {
    throw new Error('schema_tests filter is empty or missing');
  }
  return patterns;
}

function expectSchemaTestPaths(
  patterns: string[],
  paths: readonly string[],
  subject: string
): void {
  const isSchemaTestPath = picomatch(patterns);
  const missing = paths.filter((path) => !isSchemaTestPath(path));

  expect(
    missing,
    `${subject} missing from schema_tests: ${missing.join(', ')}. Add every listed path to ${PATH_FILTERS} under schema_tests.`
  ).toEqual([]);
}

describe('Testcontainers path-filter parity', () => {
  it('matches every canonical Testcontainers include with schema_tests', () => {
    const patterns = schemaTestPatterns();

    expectSchemaTestPaths(
      patterns,
      TESTCONTAINERS_TEST_PATHS,
      'Canonical Testcontainers test paths'
    );
  });

  it('matches canonical Testcontainers list module with schema_tests', () => {
    const patterns = schemaTestPatterns();

    expectSchemaTestPaths(
      patterns,
      [TESTCONTAINERS_TEST_PATHS_MODULE],
      'Canonical Testcontainers list module'
    );
  });

  it('matches every core Testcontainers trigger seam with schema_tests', () => {
    const patterns = schemaTestPatterns();

    expectSchemaTestPaths(
      patterns,
      REQUIRED_TESTCONTAINERS_TRIGGER_SEAMS,
      'Core Testcontainers trigger seams'
    );
  });

  it('matches every required conversion production seam with schema_tests', () => {
    const patterns = schemaTestPatterns();

    expectSchemaTestPaths(
      patterns,
      REQUIRED_SCHEMA_TEST_SEAMS,
      'Required conversion production seams'
    );
  });
});
