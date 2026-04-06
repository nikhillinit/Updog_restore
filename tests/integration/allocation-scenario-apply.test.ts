import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';

let pool: Pool;
let makeApp: typeof import('../../server/app').makeApp;

let app: Express;
let testFundId: number;
let companyOneId: number;
let companyTwoId: number;

async function ensureScenarioSchema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funds (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      size DECIMAL(15,2) NOT NULL,
      management_fee DECIMAL(5,4) NOT NULL,
      carry_percentage DECIMAL(5,4) NOT NULL,
      vintage_year INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfoliocompanies (
      id SERIAL PRIMARY KEY,
      fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sector TEXT NOT NULL,
      stage TEXT NOT NULL,
      investment_amount DECIMAL(15,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      planned_reserves_cents BIGINT NOT NULL DEFAULT 0,
      deployed_reserves_cents BIGINT NOT NULL DEFAULT 0,
      allocation_cap_cents BIGINT,
      allocation_reason TEXT,
      allocation_version INTEGER NOT NULL DEFAULT 1,
      last_allocation_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fund_events (
      id SERIAL PRIMARY KEY,
      fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      payload JSONB,
      user_id INTEGER,
      correlation_id VARCHAR(36),
      event_time TIMESTAMPTZ NOT NULL,
      operation VARCHAR(50),
      entity_type VARCHAR(50),
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const filename of [
    '20260330_allocation_scenarios_v1.up.sql',
    '20260330_allocation_scenario_events_v1.up.sql',
    '20260406_allocation_scenario_ic_decisions_v1.up.sql',
  ]) {
    const sql = fs.readFileSync(path.resolve('server/migrations', filename), 'utf8');
    await pool.query(sql);
  }
}

describe('allocation scenario sync/apply integration', () => {
  beforeAll(async () => {
    const dbModule = await import('../../server/db/pg-circuit');
    pool = dbModule.pool;

    const appModule = await import('../../server/app');
    makeApp = appModule.makeApp;

    await ensureScenarioSchema();
  });

  beforeEach(async () => {
    app = makeApp();

    const fundResult = await pool.query(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Scenario Apply Fund', '100000000', '0.02', '0.20', 2024]
    );
    testFundId = fundResult.rows[0].id as number;

    const companyOne = await pool.query(
      `INSERT INTO portfoliocompanies
       (fund_id, name, sector, stage, investment_amount, status,
        planned_reserves_cents, deployed_reserves_cents, allocation_cap_cents, allocation_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [testFundId, 'Alpha', 'SaaS', 'Seed', '1000000', 'active', 500000, 100000, 900000, 1]
    );
    companyOneId = companyOne.rows[0].id as number;

    const companyTwo = await pool.query(
      `INSERT INTO portfoliocompanies
       (fund_id, name, sector, stage, investment_amount, status,
        planned_reserves_cents, deployed_reserves_cents, allocation_cap_cents, allocation_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [testFundId, 'Beta', 'FinTech', 'Series A', '2000000', 'active', 800000, 250000, null, 1]
    );
    companyTwoId = companyTwo.rows[0].id as number;
  });

  afterEach(async () => {
    if (!testFundId) {
      return;
    }

    await pool.query(
      `DELETE FROM allocation_scenarios
       WHERE fund_id = $1`,
      [testFundId]
    );
    await pool.query('DELETE FROM fund_events WHERE fund_id = $1', [testFundId]);
    await pool.query('DELETE FROM portfoliocompanies WHERE fund_id = $1', [testFundId]);
    await pool.query('DELETE FROM funds WHERE id = $1', [testFundId]);
  });

  it('applies a previewed scenario to live allocations and records both audit trails', async () => {
    const createResponse = await request(app)
      .post(`/api/funds/${testFundId}/allocation-scenarios`)
      .send({
        name: 'Committee upside plan',
        notes: 'Increase Alpha for follow-on support',
        source_allocation_version: 1,
        snapshot_items: [
          {
            company_id: companyOneId,
            planned_reserves_cents: 750000,
            allocation_cap_cents: 900000,
            allocation_reason: 'Lead Series A extension',
          },
          {
            company_id: companyTwoId,
            planned_reserves_cents: 800000,
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      })
      .expect(201);

    const scenarioId = createResponse.body.id as string;

    const previewResponse = await request(app)
      .get(`/api/funds/${testFundId}/allocation-scenarios/${scenarioId}/apply-preview`)
      .expect(200);

    expect(previewResponse.body).toMatchObject({
      drift_status: 'exact_match',
      apply_state: 'apply_allowed',
      summary: {
        companies_changed: 1,
        companies_unchanged: 1,
      },
    });

    const applyResponse = await request(app)
      .post(`/api/funds/${testFundId}/allocation-scenarios/${scenarioId}/apply`)
      .send({
        preview_token: previewResponse.body.live_token,
        note: 'Apply after IC approval',
      })
      .expect(200);

    expect(applyResponse.body).toMatchObject({
      scenario: {
        id: scenarioId,
        source_allocation_version: 2,
        last_applied_allocation_version: 2,
      },
      event: {
        event_type: 'applied',
        note: 'Apply after IC approval',
        source_allocation_version: 1,
        resulting_allocation_version: 2,
      },
      live: {
        updated_count: 1,
        resulting_allocation_version: 2,
      },
    });

    const liveRows = await pool.query(
      `SELECT id, planned_reserves_cents, allocation_reason, allocation_version
       FROM portfoliocompanies
       WHERE fund_id = $1
       ORDER BY id`,
      [testFundId]
    );

    expect(liveRows.rows).toEqual([
      expect.objectContaining({
        id: companyOneId,
        planned_reserves_cents: '750000',
        allocation_reason: 'Lead Series A extension',
        allocation_version: 2,
      }),
      expect.objectContaining({
        id: companyTwoId,
        planned_reserves_cents: '800000',
        allocation_reason: null,
        allocation_version: 1,
      }),
    ]);

    const scenarioEventRows = await pool.query(
      `SELECT event_type, note, source_allocation_version, resulting_allocation_version, change_summary_json
       FROM allocation_scenario_events
       WHERE scenario_id = $1`,
      [scenarioId]
    );

    expect(scenarioEventRows.rows).toHaveLength(1);
    expect(scenarioEventRows.rows[0]).toMatchObject({
      event_type: 'applied',
      note: 'Apply after IC approval',
      source_allocation_version: 1,
      resulting_allocation_version: 2,
    });
    expect(scenarioEventRows.rows[0].change_summary_json).toMatchObject({
      companies_changed: 1,
      companies_unchanged: 1,
      total_planned_delta_cents: 250000,
    });

    const fundEventRows = await pool.query(
      `SELECT event_type, payload, metadata
       FROM fund_events
       WHERE fund_id = $1`,
      [testFundId]
    );

    expect(fundEventRows.rows).toHaveLength(1);
    expect(fundEventRows.rows[0].event_type).toBe('ALLOCATION_UPDATED');
    expect(fundEventRows.rows[0].payload).toMatchObject({
      new_version: 2,
      update_count: 1,
    });
    expect(fundEventRows.rows[0].metadata).toMatchObject({
      source: 'allocation_scenario_apply',
      scenario_id: scenarioId,
    });
  });

  it('syncs a saved scenario from live allocations without mutating live rows', async () => {
    const createResponse = await request(app)
      .post(`/api/funds/${testFundId}/allocation-scenarios`)
      .send({
        name: 'Stale scenario',
        notes: 'Will be refreshed from live',
        source_allocation_version: 1,
        snapshot_items: [
          {
            company_id: companyOneId,
            planned_reserves_cents: 900000,
            allocation_cap_cents: 900000,
            allocation_reason: 'Stale scenario value',
          },
          {
            company_id: companyTwoId,
            planned_reserves_cents: 600000,
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      })
      .expect(201);

    const scenarioId = createResponse.body.id as string;

    const syncResponse = await request(app)
      .post(`/api/funds/${testFundId}/allocation-scenarios/${scenarioId}/sync`)
      .send({
        note: 'Refresh from current live state',
      })
      .expect(200);

    expect(syncResponse.body).toMatchObject({
      scenario: {
        id: scenarioId,
        source_allocation_version: 1,
        company_count: 2,
        total_planned_cents: 1300000,
      },
      event: {
        event_type: 'synced',
        note: 'Refresh from current live state',
      },
    });

    const syncedItems = await pool.query(
      `SELECT company_id, planned_reserves_cents, allocation_reason
       FROM allocation_scenario_items
       WHERE scenario_id = $1
       ORDER BY company_id`,
      [scenarioId]
    );

    expect(syncedItems.rows).toEqual([
      expect.objectContaining({
        company_id: companyOneId,
        planned_reserves_cents: '500000',
        allocation_reason: null,
      }),
      expect.objectContaining({
        company_id: companyTwoId,
        planned_reserves_cents: '800000',
        allocation_reason: null,
      }),
    ]);

    const liveRows = await pool.query(
      `SELECT id, planned_reserves_cents, allocation_version
       FROM portfoliocompanies
       WHERE fund_id = $1
       ORDER BY id`,
      [testFundId]
    );

    expect(liveRows.rows).toEqual([
      expect.objectContaining({ id: companyOneId, planned_reserves_cents: '500000', allocation_version: 1 }),
      expect.objectContaining({ id: companyTwoId, planned_reserves_cents: '800000', allocation_version: 1 }),
    ]);
  });

  it('persists Reserve IC decisions under the scenario boundary and returns them to the client', async () => {
    const createScenarioResponse = await request(app)
      .post(`/api/funds/${testFundId}/allocation-scenarios`)
      .send({
        name: 'IC decision scenario',
        notes: 'Committee packet ready',
        source_allocation_version: 1,
        snapshot_items: [
          {
            company_id: companyOneId,
            planned_reserves_cents: 750000,
            allocation_cap_cents: 900000,
            allocation_reason: 'Lead Series A extension',
          },
          {
            company_id: companyTwoId,
            planned_reserves_cents: 800000,
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      })
      .expect(201);

    const scenarioId = createScenarioResponse.body.id as string;

    const createDecisionResponse = await request(app)
      .post(`/api/funds/${testFundId}/allocation-scenarios/${scenarioId}/decisions`)
      .send({
        fundId: testFundId,
        companyId: companyOneId,
        decisionType: 'follow_on',
        decisionStatus: 'proposed',
        rationale: 'Reserve for a larger Series B check',
        proposedPlannedReservesCents: 750000,
        finalPlannedReservesCents: null,
        provenance: {
          sourceScenarioId: scenarioId,
          sourceAllocationVersion: 1,
          liveAllocationVersion: 1,
        },
      })
      .expect(201);

    expect(createDecisionResponse.body).toMatchObject({
      fundId: testFundId,
      companyId: companyOneId,
      decisionType: 'follow_on',
      decisionStatus: 'proposed',
    });

    const createRemovedCompanyDecisionResponse = await request(app)
      .post(`/api/funds/${testFundId}/allocation-scenarios/${scenarioId}/decisions`)
      .send({
        fundId: testFundId,
        companyId: companyTwoId,
        decisionType: 'defer',
        decisionStatus: 'draft',
        rationale: 'Wait for the next milestone before increasing reserves',
        proposedPlannedReservesCents: 800000,
        finalPlannedReservesCents: null,
        provenance: {
          sourceScenarioId: scenarioId,
          sourceAllocationVersion: 1,
          liveAllocationVersion: 1,
        },
      })
      .expect(201);

    const updateDecisionResponse = await request(app)
      .patch(
        `/api/funds/${testFundId}/allocation-scenarios/${scenarioId}/decisions/${createDecisionResponse.body.id}`
      )
      .send({
        decisionStatus: 'approved',
        rationale: 'Approved for follow-on',
        finalPlannedReservesCents: 700000,
        provenance: {
          sourceScenarioId: scenarioId,
          sourceAllocationVersion: 1,
          liveAllocationVersion: 1,
        },
      })
      .expect(200);

    expect(updateDecisionResponse.body).toMatchObject({
      id: createDecisionResponse.body.id,
      decisionStatus: 'approved',
      finalPlannedReservesCents: 700000,
    });

    const updateScenarioResponse = await request(app)
      .patch(`/api/funds/${testFundId}/allocation-scenarios/${scenarioId}`)
      .send({
        snapshot_items: [
          {
            company_id: companyOneId,
            planned_reserves_cents: 700000,
            allocation_cap_cents: 900000,
            allocation_reason: 'Approved follow-on reserve',
          },
        ],
      })
      .expect(200);

    expect(updateScenarioResponse.body).toMatchObject({
      id: scenarioId,
      company_count: 1,
    });

    const listResponse = await request(app)
      .get(`/api/funds/${testFundId}/allocation-scenarios/${scenarioId}/decisions`)
      .expect(200);

    expect(listResponse.body).toEqual({
      decisions: [
        expect.objectContaining({
          id: createDecisionResponse.body.id,
          companyId: companyOneId,
          decisionStatus: 'approved',
        }),
      ],
    });
    expect(listResponse.body.decisions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createRemovedCompanyDecisionResponse.body.id,
        }),
      ])
    );
  });
});
