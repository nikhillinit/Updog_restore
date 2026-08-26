import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const V1_FILES: Record<string, string> = {
  'shared/lib/internal-economics/cash-assembly-call-sizing-v1.ts':
    '83a756850944df91b4277f037c5eafffecaaafc468681c1f0ff7ff5d12d8c64e',
  'shared/lib/internal-economics/cash-assembly-event-stream-v1.ts':
    'a86e1b6f63217b38480f9f9a58f1a6998b2a15954cd087d1651dea2f906ca2c2',
  'shared/lib/internal-economics/cash-assembly-period-loop-v1.ts':
    'c56b1a32db0ef372f8043b0518234b5a4e2af68ea5ce829e50e235da33181fef',
  'shared/lib/internal-economics/cash-assembly-types-v1.ts':
    '986792b346e1b30f96d868fdb3799e6d0c4ffde5afef542a895fb679ca68905f',
  'shared/lib/internal-economics/decimal-waterfall-core-v1.ts':
    'd4231c22fce3c2269a9c434b797110d31c0e9cd27958bfad7b39dcd19010495d',
  'shared/lib/internal-economics/effective-fee-expense-bridge-v1.ts':
    '8f6dfe06ee35afb234bca936fab445a7bc4cafbf77384a842ea10e10b8f507b1',
  'shared/lib/internal-economics/ledger-allocation-v1.ts':
    'ab73c62a25ec762e4643b12c9c3ea3b851bdfdbfaeae54f07644c6b7c2abb6f9',
  'shared/lib/internal-economics/presentation-rounding-v1.ts':
    'e85935dbc8295afd6041868836515a57ef44ef57a73e1f022a999d72155b9d39',
  'shared/lib/internal-economics/quarterly-schedule-compiler-v1.ts':
    '73ed8b3bad001bd4ba6a1550ec0a7929d8f84dc3f0e9ef716d1664861e7887cc',
  'shared/lib/internal-economics/ratio-null-guard-v1.ts':
    '7d3b7886b8a5aec9cd737a0c90fbc0de6eaeba6204414db74773b7c7d9830204',
  'server/services/internal-economics/capital-envelope-service.ts':
    '4e60a8aeb8f885fc6e35ab3a901080403ae3f6e83d288c9aadb9c4f98b7a187e',
  'server/services/internal-economics/economics-policy-service.ts':
    '26db8be872a073d79f3903e8c058eae68d50d029c91a53f3e8c63ed198bf62fe',
  'server/services/internal-economics/lp-economics-run-service.ts':
    '6fea6fa9f476ee07fc023af7a8e09939e261fc314ec01bc21ffbf4621ffc3777',
  'shared/lib/current-plan/derive-current-plan-v1.ts':
    '150eb9d2d7d16fd933279fefb721111afe3012ecb4840e5291fb00466910f330',
};

const ROOT = resolve(__dirname, '../../..');

function sha256(filePath: string): string {
  const abs = resolve(ROOT, filePath);
  const output = execSync(`shasum -a 256 "${abs}"`, { encoding: 'utf-8' });
  return output.split(/\s/)[0]!;
}

describe('V1 internal-economics freeze certification', () => {
  it('covers all 14 V1 source files', () => {
    expect(Object.keys(V1_FILES)).toHaveLength(14);
  });

  for (const [file, expected] of Object.entries(V1_FILES)) {
    it(`${file} is byte-identical to Phase 0 baseline`, () => {
      expect(sha256(file)).toBe(expected);
    });
  }
});
