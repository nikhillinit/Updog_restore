import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const TIMEZONES = ['UTC', 'America/New_York', 'Asia/Kolkata'] as const;
const CERTIFICATION_OUTPUT_PREFIX = 'LP_ECONOMICS_V1_1_CERTIFICATION:';

interface CertificationEvidence {
  readonly timezone: (typeof TIMEZONES)[number];
  readonly canonicalResultBytes: string;
  readonly inputHash: string;
  readonly resultHash: string;
}

async function runInFreshProcess(timezone: (typeof TIMEZONES)[number]) {
  const vitestCli = path.join(process.cwd(), 'node_modules/vitest/vitest.mjs');
  const config = path.join(process.cwd(), 'tests/fixtures/internal-economics/vitest.config.ts');
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      vitestCli,
      'run',
      '--config',
      config,
      '--testNamePattern',
      'emits representative final V1.1 bytes and hashes',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, TZ: timezone, LP_ECONOMICS_CERTIFICATION_OUTPUT: '1' },
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }
  );
  const evidenceLine = stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith(CERTIFICATION_OUTPUT_PREFIX));
  if (evidenceLine === undefined) {
    throw new Error(`Certification subprocess for ${timezone} emitted no evidence.`);
  }
  return JSON.parse(
    evidenceLine.slice(CERTIFICATION_OUTPUT_PREFIX.length)
  ) as CertificationEvidence;
}

describe('V1.1 full-result timezone certification', () => {
  it('pins identical canonical bytes and hashes from fresh UTC, New York, and Kolkata processes', async () => {
    const evidence = await Promise.all(TIMEZONES.map(runInFreshProcess));
    expect(evidence.map(({ timezone }) => timezone)).toEqual(TIMEZONES);

    const [reference, ...comparisons] = evidence;
    expect(reference).toBeDefined();
    for (const comparison of comparisons) {
      expect(Buffer.from(comparison.canonicalResultBytes)).toEqual(
        Buffer.from(reference!.canonicalResultBytes)
      );
      expect(comparison.inputHash).toBe(reference!.inputHash);
      expect(comparison.resultHash).toBe(reference!.resultHash);
    }

    expect(createHash('sha256').update(reference!.canonicalResultBytes, 'utf8').digest('hex')).toBe(
      reference!.resultHash
    );
    expect(reference).toMatchObject({
      inputHash: '95753293e0bb10c38c3e78d9e6ffdd72f194278d646bec73c65af82ae8b0811b',
      resultHash: 'd646867ffa1c1eb73ad36d607463748d8500bcd49d07ebb8e4dc96ae67447cd6',
    });

    const result = JSON.parse(reference!.canonicalResultBytes) as Record<string, unknown>;
    expect(result).toMatchObject({
      clock: '2026-12-31T23:59:59.000Z',
      precisionMode: 'decimal_native_with_float64_xirr',
      resultStatus: 'indicative',
      reasons: [{ code: 'LP_NET_NAV_FLAT_SHARE_APPROXIMATION' }],
      terminalNavBeforeRealizationUsd: '20.000000',
    });
  });
});
