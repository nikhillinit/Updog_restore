import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LANE_B_ALLOWLIST,
  analyzeServerMigrations,
  checkServerMigrations,
} from '../../../scripts/guardrails/server-migrations-new-file.mjs';

// Independent copy (not imported) so a wrong edit to the shipped constant is
// caught by the "pins the shipped allowlist" test below.
const LANE_B = [
  '20260621_investments_id_fund_unique_v1.up.sql',
  '20260621_investments_id_fund_unique_v1.down.sql',
  '20260621_z_investment_rounds_v1.up.sql',
  '20260621_z_investment_rounds_v1.down.sql',
  '20260623_z_investment_rounds_operational_v1.up.sql',
  '20260623_z_investment_rounds_operational_v1.down.sql',
  '20260624_investment_round_model_overrides_v1.up.sql',
  '20260624_investment_round_model_overrides_v1.down.sql',
];

describe('server-migrations-new-file guard (analyze)', () => {
  it('flags a non-lane-B file as an offender', () => {
    const result = analyzeServerMigrations({
      entries: [...LANE_B, '001_initial_schema.sql'],
      allowlist: LANE_B,
    });
    expect(result.ok).toBe(false);
    expect(result.offenders).toHaveLength(1);
    expect(result.offenders[0]).toMatchObject({
      code: 'server-migrations-new-file',
      file: 'server/migrations/001_initial_schema.sql',
      severity: 'error',
    });
  });

  it('flags a nested file (relative path never matches a flat allowlist entry)', () => {
    const result = analyzeServerMigrations({
      entries: [...LANE_B, 'sub/0099_nested.sql'],
      allowlist: LANE_B,
    });
    expect(result.ok).toBe(false);
    expect(result.offenders.map((offender) => offender.file)).toEqual([
      'server/migrations/sub/0099_nested.sql',
    ]);
  });

  it('passes when only lane-B carve-out files are present', () => {
    const result = analyzeServerMigrations({ entries: LANE_B, allowlist: LANE_B });
    expect(result.ok).toBe(true);
    expect(result.offenders).toEqual([]);
  });
});

describe('server-migrations-new-file guard (real filesystem, shipped default allowlist)', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-mig-guard-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('pins the shipped allowlist to exactly the 8 lane-B files', () => {
    expect([...LANE_B_ALLOWLIST].sort()).toEqual([...LANE_B].sort());
  });

  it('passes when only the shipped lane-B files are present (default allowlist)', () => {
    for (const name of LANE_B_ALLOWLIST) {
      fs.writeFileSync(path.join(dir, name), '-- lane B\n');
    }
    const result = checkServerMigrations({ dir });
    expect(result.ok).toBe(true);
    expect(result.offenders).toEqual([]);
  });

  it('flags a stray flat file AND a nested file via recursive scan (default allowlist)', () => {
    for (const name of LANE_B_ALLOWLIST) {
      fs.writeFileSync(path.join(dir, name), '-- lane B\n');
    }
    fs.writeFileSync(path.join(dir, '001_initial_schema.sql'), '-- stray\n');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', '0099_nested.sql'), '-- nested\n');

    const result = checkServerMigrations({ dir });
    expect(result.ok).toBe(false);
    expect(result.offenders.map((offender) => offender.file)).toEqual([
      'server/migrations/001_initial_schema.sql',
      'server/migrations/sub/0099_nested.sql',
    ]);
  });

  it('passes when the migrations directory is absent', () => {
    const result = checkServerMigrations({
      dir: path.join(dir, '__does_not_exist__'),
      allowlist: LANE_B,
    });
    expect(result.ok).toBe(true);
    expect(result.offenders).toEqual([]);
  });
});
