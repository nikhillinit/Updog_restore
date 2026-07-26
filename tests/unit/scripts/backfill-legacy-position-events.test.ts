import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  legacyPositionBackfillUsage,
  parseLegacyPositionBackfillArgs,
  runLegacyPositionBackfillCli,
  type LegacyBackfillRunner,
} from '../../../scripts/backfill-legacy-position-events';

describe('legacy position backfill CLI', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('parses help without invoking the service runner', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const runner = vi.fn<LegacyBackfillRunner>();

    await runLegacyPositionBackfillCli(['--help'], runner);

    expect(runner).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(legacyPositionBackfillUsage());
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('sets nonzero exit code for blocked result', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const runner = vi.fn<LegacyBackfillRunner>().mockResolvedValue({
      mode: 'apply',
      fundsScanned: 1,
      investmentsScanned: 1,
      planned: 0,
      written: 0,
      skipped: 0,
      blocked: 1,
      createdMainVehicles: 0,
      candidates: [],
    });

    await runLegacyPositionBackfillCli(
      ['--apply', '--fund-id', '7', '--expected-source-hash', `800=${'a'.repeat(64)}`],
      runner
    );

    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledOnce();
  });

  it('parses resume plans and expected source hashes', () => {
    expect(
      parseLegacyPositionBackfillArgs([
        '--resume',
        '--fund-id',
        '7',
        '--expected-source-hash',
        `800=${'b'.repeat(64)}`,
      ])
    ).toMatchObject({
      mode: 'resume',
      fundIds: [7],
      expectedSourceHashes: { '800': 'b'.repeat(64) },
    });
  });
});
