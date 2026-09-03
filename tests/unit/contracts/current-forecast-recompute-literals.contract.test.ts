import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_FORECAST_RECOMPUTE_FAILURE_CODES,
  CURRENT_FORECAST_RECOMPUTE_STATUSES,
} from '../../../shared/contracts/current-forecast-v2.contract';

const readSource = (relativePath: string) =>
  readFile(path.join(process.cwd(), relativePath), 'utf8');

/** Literals of the first `IN (...)` list that follows `marker` in `source`. */
function inListAfter(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0);
  const match = /IN \(([^)]*)\)/.exec(source.slice(start));
  expect(match, `no IN list after ${marker}`).not.toBeNull();
  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '').sort();
}

// The contract owns the literals; the Drizzle schema and the shipped 0055
// migration repeat them as CHECK constraints. A literal added to the contract
// without matching constraint changes would typecheck and then fail in the
// database, so this proof pins all three sources together.
describe('current-forecast recompute literals stay synchronized', () => {
  const statuses = [...CURRENT_FORECAST_RECOMPUTE_STATUSES].sort();
  const failureCodes = [...CURRENT_FORECAST_RECOMPUTE_FAILURE_CODES].sort();

  it('schema CHECK constraints repeat the contract literals exactly', async () => {
    const schemaSource = await readSource('shared/schema/current-forecast-recompute-commands.ts');
    expect(inListAfter(schemaSource, 'current_forecast_recompute_commands_status_check')).toEqual(
      statuses
    );
    expect(
      inListAfter(schemaSource, 'current_forecast_recompute_commands_failure_code_check')
    ).toEqual(failureCodes);
  });

  it('migration 0055 CHECK constraints repeat the contract literals exactly', async () => {
    const migrationSource = await readSource(
      'migrations/0055_current_forecast_recompute_commands.sql'
    );
    expect(inListAfter(migrationSource, 'CHECK (status IN')).toEqual(statuses);
    expect(inListAfter(migrationSource, 'failure_code IN')).toEqual(failureCodes);
  });
});
