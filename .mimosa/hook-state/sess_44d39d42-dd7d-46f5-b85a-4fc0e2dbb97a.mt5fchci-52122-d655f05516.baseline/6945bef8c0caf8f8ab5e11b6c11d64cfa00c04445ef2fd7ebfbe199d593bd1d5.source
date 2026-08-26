import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LANE_B_ALLOWLIST,
  analyzeServerMigrations,
  checkServerMigrations,
} from '../../../scripts/guardrails/server-migrations-new-file.mjs';

describe('server-migrations-new-file guard (analyze)', () => {
  it('pins the shipped allowlist to empty', () => {
    expect(LANE_B_ALLOWLIST).toEqual([]);
  });

  it('flags former lane-B and generic files as offenders with the default allowlist', () => {
    const result = analyzeServerMigrations({
      entries: ['20260621_z_investment_rounds_v1.up.sql', '001_initial_schema.sql'],
    });
    expect(result.ok).toBe(false);
    expect(result.offenders.map((offender) => offender.file)).toEqual([
      'server/migrations/001_initial_schema.sql',
      'server/migrations/20260621_z_investment_rounds_v1.up.sql',
    ]);
    expect(result.offenders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'server-migrations-new-file',
          file: 'server/migrations/001_initial_schema.sql',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'server-migrations-new-file',
          file: 'server/migrations/20260621_z_investment_rounds_v1.up.sql',
          severity: 'error',
        }),
      ])
    );
  });

  it('flags a nested relative path as an offender', () => {
    const result = analyzeServerMigrations({
      entries: ['sub/0099_nested.sql'],
    });
    expect(result.ok).toBe(false);
    expect(result.offenders.map((offender) => offender.file)).toEqual([
      'server/migrations/sub/0099_nested.sql',
    ]);
  });

  it('passes when no entries are present', () => {
    const result = analyzeServerMigrations({ entries: [] });
    expect(result.ok).toBe(true);
    expect(result.offenders).toEqual([]);
  });
});

describe('server-migrations-new-file guard (real filesystem, shipped default allowlist)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-mig-guard-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes when the migrations directory is empty', () => {
    const result = checkServerMigrations({ dir });
    expect(result.ok).toBe(true);
    expect(result.offenders).toEqual([]);
  });

  it('passes when the migrations directory is absent', () => {
    const result = checkServerMigrations({
      dir: path.join(dir, '__does_not_exist__'),
    });
    expect(result.ok).toBe(true);
    expect(result.offenders).toEqual([]);
  });

  it('flags a former lane-B file and a nested file via recursive scan', () => {
    fs.writeFileSync(path.join(dir, '20260621_z_investment_rounds_v1.up.sql'), '-- former lane B\n');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', '0099_nested.sql'), '-- nested\n');

    const result = checkServerMigrations({ dir });
    expect(result.ok).toBe(false);
    expect(result.offenders.map((offender) => offender.file)).toEqual([
      'server/migrations/20260621_z_investment_rounds_v1.up.sql',
      'server/migrations/sub/0099_nested.sql',
    ]);
  });
});
