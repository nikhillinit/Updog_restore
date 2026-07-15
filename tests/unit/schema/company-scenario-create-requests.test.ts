import fs from 'node:fs';
import path from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

describe('company scenario create request ledger', () => {
  it('is exported with the dedicated durable request shape', () => {
    expect(schema.companyScenarioCreateRequests).toBeDefined();

    const config = getTableConfig(schema.companyScenarioCreateRequests);
    expect(config.name).toBe('company_scenario_create_requests');
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'fund_id',
      'company_id',
      'scenario_id',
      'idempotency_key',
      'request_hash',
      'created_by',
      'status',
      'response_status',
      'response_body',
      'created_at',
      'updated_at',
    ]);
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      'company_scenario_create_requests_fund_idempotency_key_unique'
    );
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      'company_scenario_create_requests_status_check'
    );
  });

  it('is installed by the next journaled drift migration', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'migrations', '0033_company_scenario_create_requests.sql'),
      'utf8'
    );

    expect(sql).toContain('-- @drift-patch');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "company_scenario_create_requests"/);
    expect(sql).toMatch(
      /UNIQUE \("fund_id", "idempotency_key"\)/
    );
    expect(sql).toMatch(/CHECK \("status" IN \('pending', 'completed'\)\)/);
  });
});
