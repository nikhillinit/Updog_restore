import fs from 'node:fs';

import picomatch from 'picomatch';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';

const TESTCONTAINERS_CONFIG = 'vitest.config.testcontainers.ts';
const PATH_FILTERS = '.github/path-filters.yml';

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

function activeTestcontainersIncludes(): string[] {
  const config = fs.readFileSync(TESTCONTAINERS_CONFIG, 'utf8');
  const includeBlock = config.match(/include:\s*\[([\s\S]*?)\],\s*exclude:/)?.[1];
  if (!includeBlock) {
    throw new Error('Could not find vitest.config.testcontainers.ts include block');
  }

  const uncommentedIncludeBlock = includeBlock
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  const includePaths = [...uncommentedIncludeBlock.matchAll(/'([^']+\.test\.ts)'/g)].map(
    (match) => match[1]!
  );
  if (includePaths.length === 0) {
    throw new Error('No active Testcontainers include paths found');
  }
  return includePaths;
}

function schemaTestPatterns(): string[] {
  const filters = YAML.parse(fs.readFileSync(PATH_FILTERS, 'utf8')) as PathFilters;
  const patterns = filters.schema_tests ?? [];
  if (patterns.length === 0) {
    throw new Error('schema_tests filter is empty or missing');
  }
  return patterns;
}

describe('Testcontainers path-filter parity', () => {
  it('matches every active Testcontainers include with schema_tests', () => {
    const patterns = schemaTestPatterns();
    const isSchemaTestPath = picomatch(patterns);
    const missing = activeTestcontainersIncludes().filter((includePath) => !isSchemaTestPath(includePath));

    expect(missing).toEqual([]);
  });

  it('matches every required conversion production seam with schema_tests', () => {
    const patterns = schemaTestPatterns();
    const isSchemaTestPath = picomatch(patterns);
    const missing = REQUIRED_SCHEMA_TEST_SEAMS.filter((seamPath) => !isSchemaTestPath(seamPath));

    expect(missing).toEqual([]);
  });
});
