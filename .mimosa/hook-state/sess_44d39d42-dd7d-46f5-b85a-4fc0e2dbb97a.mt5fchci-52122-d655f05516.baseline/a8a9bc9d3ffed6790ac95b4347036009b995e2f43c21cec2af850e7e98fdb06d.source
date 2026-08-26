import { sql } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import {
  FundCalculationModeVersionConflictError,
  updateCurrentForecastCalculationMode,
  type FundCalculationModeDatabase,
} from '../../../server/services/fund-calculation-mode-service';
import {
  updateFundMoicInputs,
  type FundMoicInputUpdateResponse,
} from '../../../server/services/fund-moic-input-service';
import { NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE } from '../../../server/lib/transaction-support';
import {
  activateCurrentForecast,
  advanceCurrentForecastPointer,
  type CurrentForecastReferenceDatabase,
} from '../../../server/services/current-forecast-reference-service';
import {
  approveMetricRun,
  lockMetricRun,
} from '../../../server/services/lp-reporting/metric-run-lifecycle-service';
import { createMetricRunEvidence } from '../../../server/services/lp-reporting/metric-run-evidence-service';
import {
  approveNarrativeDraft,
  editNarrativeDraft,
  reviewNarrativeDraft,
} from '../../../server/services/lp-reporting/narrative-run-service';
import { createPlanningFmvOverride } from '../../../server/services/lp-reporting/planning-fmv-override-service';
import { initializeNeonLaneSchema, startNeonLane, type NeonLane } from './neon-lane';

let lane: NeonLane;

beforeAll(async () => {
  lane = await startNeonLane();
  await initializeNeonLaneSchema(lane.http);
});

afterAll(async () => {
  await lane?.cleanup();
});

async function expectExactNeonHttpError(operation: () => Promise<unknown>): Promise<void> {
  let thrown: unknown;
  try {
    await operation();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeDefined();
  expect(thrown instanceof Error ? thrown.message : String(thrown)).toBe(
    NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE
  );
}

async function resetSemanticTables(): Promise<void> {
  await lane.http.execute(sql`DROP TABLE IF EXISTS neon_lane_b, neon_lane_a`);
  await lane.http.execute(
    sql`CREATE TABLE neon_lane_a (id integer PRIMARY KEY, value text NOT NULL)`
  );
  await lane.http.execute(
    sql`CREATE TABLE neon_lane_b (id integer PRIMARY KEY, a_id integer NOT NULL REFERENCES neon_lane_a(id))`
  );
}

async function resetPostRepairTables(): Promise<void> {
  await lane.http.execute(
    sql`TRUNCATE current_forecast_references, fund_moic_input_update_requests, fund_events,
      evidence_records, narrative_runs, lp_metric_runs, portfoliocompanies,
      fund_calculation_mode_requests, fund_calculation_modes
      RESTART IDENTITY CASCADE`
  );
}

async function seedMetricRun(status = 'draft', version = 1): Promise<void> {
  await lane.http.execute(sql`
    INSERT INTO lp_metric_runs
      (fund_id, as_of_date, run_type, perspective, status, inputs_hash,
       source_event_ids, source_mark_ids, source_evidence_ids, results_json,
       diagnostics_json, methodology_version, calculation_version, version)
    VALUES
      (1, '2026-08-07', 'quarterly_report', 'lp_net', ${status}::varchar,
       'lane-input', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
       '{}'::jsonb, '{}'::jsonb, 'lane-methodology', 'lane-calculation', ${version}::integer)
  `);
}

async function seedNarrativeRun(
  status = 'draft',
  version = 1,
  editedText: string | null = null
): Promise<void> {
  await lane.http.execute(sql`
    INSERT INTO narrative_runs
      (fund_id, metric_run_id, as_of_date, narrative_type, generated_text,
       edited_text, status, version)
    VALUES
      (1, 1, '2026-08-07', 'methodology', 'generated', ${editedText}::text,
       ${status}::varchar, ${version}::integer)
  `);
}

async function insertLaneReference(idempotencyKey: string, candidate = true): Promise<number> {
  const inserted = await lane.http.execute(sql`
    INSERT INTO current_forecast_references
      (fund_id, fund_snapshot_id, current_plan_version_id, financial_facts_snapshot_id,
       input_hash, result_hash, assumptions_hash, engine_version, methodology_version,
       candidate, idempotency_key, request_hash)
    VALUES
      (1, 11, 21, 31, ${`${idempotencyKey}-input`}, ${`${idempotencyKey}-result`},
       ${`${idempotencyKey}-assumptions`}, 'lane-engine', 'lane-methodology',
       ${candidate}, ${idempotencyKey}, ${`${idempotencyKey}-request`})
    RETURNING id
  `);
  return Number(inserted.rows[0]?.id);
}

describe('real Neon transaction semantics', () => {
  it('constructs independent neon-http and WebSocket Pool Drizzle drivers', async () => {
    const httpRows = await lane.http.execute(sql`SELECT 1 AS value`);
    expect(Number(httpRows.rows[0]?.value)).toBe(1);

    const websocketRows = await lane.websocket.execute(sql`SELECT 1 AS value`);
    expect(Number(websocketRows.rows[0]?.value)).toBe(1);
    await lane.websocket.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT 1`);
    });
  });

  it('pins neon-http transaction failure with the exact driver message', async () => {
    await expectExactNeonHttpError(async () => {
      await lane.http.transaction(async (transaction) => {
        await transaction.execute(sql`SELECT 1`);
      });
    });
  });

  it('pins atomic rollback for a failing data-modifying CTE chain', async () => {
    await resetSemanticTables();

    await expect(
      lane.http.execute(sql`
        WITH inserted_a AS (
          INSERT INTO neon_lane_a (id, value) VALUES (1, 'atomic') RETURNING id
        )
        INSERT INTO neon_lane_b (id, a_id)
        SELECT 1, 999 FROM inserted_a
      `)
    ).rejects.toBeDefined();

    const rows = await lane.http.execute(
      sql`SELECT count(*)::int AS count FROM neon_lane_a WHERE id = 1`
    );
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });

  it('pins zero-row guard CTE fencing for dependent writes', async () => {
    await resetSemanticTables();

    await lane.http.execute(sql`
      WITH guard AS (
        SELECT id FROM neon_lane_a WHERE id = -1 FOR UPDATE
      ), inserted AS (
        INSERT INTO neon_lane_a (id, value)
        SELECT 2, 'guarded' FROM guard
        RETURNING id
      )
      SELECT count(*) FROM inserted
    `);

    const rows = await lane.http.execute(
      sql`SELECT count(*)::int AS count FROM neon_lane_a WHERE id = 2`
    );
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });

  it('pins SELECT FOR UPDATE guard CTE dependency ordering', async () => {
    await resetSemanticTables();
    await lane.http.execute(sql`INSERT INTO neon_lane_a (id, value) VALUES (10, 'head')`);

    await lane.http.execute(sql`
      WITH guard AS (
        SELECT id FROM neon_lane_a WHERE id = 10 FOR UPDATE
      ), inserted AS (
        INSERT INTO neon_lane_a (id, value)
        SELECT 11, 'advanced' FROM guard
        RETURNING id
      )
      UPDATE neon_lane_a
      SET value = 'superseded'
      FROM inserted
      WHERE neon_lane_a.id = 10
    `);

    const rows = await lane.http.execute(sql`
      SELECT
        (SELECT value FROM neon_lane_a WHERE id = 10) AS head,
        (SELECT count(*)::int FROM neon_lane_a WHERE id = 11) AS dependent_count
    `);
    expect(rows.rows[0]?.head).toBe('superseded');
    expect(Number(rows.rows[0]?.dependent_count)).toBe(1);
  });

  it('pins sequential neon-http statements as autocommit and non-atomic', async () => {
    await resetSemanticTables();
    await lane.http.execute(sql`INSERT INTO neon_lane_a (id, value) VALUES (20, 'first')`);

    await expect(
      lane.http.execute(sql`INSERT INTO neon_lane_b (id, a_id) VALUES (20, 999)`)
    ).rejects.toBeDefined();

    const rows = await lane.http.execute(
      sql`SELECT count(*)::int AS count FROM neon_lane_a WHERE id = 20`
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });
});

describe('post-repair single-statement service proofs', () => {
  it('commits current-forecast mode update atomically and replays the ledger row', async () => {
    await resetPostRepairTables();
    const database = lane.http as unknown as FundCalculationModeDatabase;
    const input = {
      fundId: 1,
      expectedVersion: 0,
      configuredMode: 'off' as const,
      idempotencyKey: 'neon-lane-mode-success',
      actorId: null,
      sources: { sourceInputHash: 'neon-lane-source' },
      database,
    };

    const result = await updateCurrentForecastCalculationMode(input);
    expect(result).toMatchObject({
      replayed: false,
      response: { calculationKey: 'current_forecast', configuredMode: 'off', version: 1 },
    });

    const committed = await lane.http.execute(sql`
      SELECT m.version, r.status, r.response_status
      FROM fund_calculation_modes AS m
      JOIN fund_calculation_mode_requests AS r
        ON r.fund_id = m.fund_id
       AND r.calculation_key = m.calculation_key
      WHERE m.fund_id = 1
        AND m.calculation_key = 'current_forecast'
        AND r.idempotency_key = ${input.idempotencyKey}
    `);
    expect(committed.rows[0]).toMatchObject({
      version: 1,
      status: 'completed',
      response_status: 200,
    });

    await expect(updateCurrentForecastCalculationMode(input)).resolves.toMatchObject({
      replayed: true,
      response: result.response,
    });
  });

  it('maps version conflict without leaving a pending mode claim', async () => {
    await resetPostRepairTables();
    const database = lane.http as unknown as FundCalculationModeDatabase;
    await updateCurrentForecastCalculationMode({
      fundId: 1,
      expectedVersion: 0,
      configuredMode: 'off',
      idempotencyKey: 'neon-lane-mode-seed',
      actorId: null,
      sources: { sourceInputHash: 'neon-lane-source' },
      database,
    });

    await expect(
      updateCurrentForecastCalculationMode({
        fundId: 1,
        expectedVersion: 0,
        configuredMode: 'off',
        idempotencyKey: 'neon-lane-mode-version-conflict',
        actorId: null,
        sources: { sourceInputHash: 'neon-lane-source' },
        database,
      })
    ).rejects.toBeInstanceOf(FundCalculationModeVersionConflictError);

    const pending = await lane.http.execute(sql`
      SELECT count(*)::int AS count
      FROM fund_calculation_mode_requests
      WHERE idempotency_key = 'neon-lane-mode-version-conflict'
        AND status = 'pending'
    `);
    expect(Number(pending.rows[0]?.count)).toBe(0);
  });

  it('suppresses mode claim when expected-version guard fails on a missing row', async () => {
    await resetPostRepairTables();
    const database = lane.http as unknown as FundCalculationModeDatabase;

    await expect(
      updateCurrentForecastCalculationMode({
        fundId: 2,
        expectedVersion: 1,
        configuredMode: 'off',
        idempotencyKey: 'neon-lane-mode-guard-failure',
        actorId: null,
        sources: { sourceInputHash: 'neon-lane-source' },
        database,
      })
    ).rejects.toMatchObject({ code: 'stale_expected_version', actualVersion: 0 });

    const claims = await lane.http.execute(sql`
      SELECT count(*)::int AS count
      FROM fund_calculation_mode_requests
      WHERE fund_id = 2
        AND idempotency_key = 'neon-lane-mode-guard-failure'
    `);
    expect(Number(claims.rows[0]?.count)).toBe(0);
  });

  it('updates MOIC inputs and completes its event and idempotency ledger atomically', async () => {
    await resetPostRepairTables();
    const inserted = await lane.http.execute(sql`
      INSERT INTO portfoliocompanies
        (fund_id, name, sector, stage, investment_amount)
      VALUES (1, 'Neon Lane Co', 'software', 'seed', 100000)
      RETURNING id
    `);
    const companyId = Number(inserted.rows[0]?.id);
    const database = lane.http as unknown as Parameters<typeof updateFundMoicInputs>[0]['database'];
    const input = {
      fundId: 1,
      companyId,
      expectedVersion: 1,
      exitProbability: 0.8,
      exitMoicBps: 35000,
      idempotencyKey: 'neon-lane-moic-input',
      actorId: null,
      database,
    };

    const result = await updateFundMoicInputs(input);
    const expected: FundMoicInputUpdateResponse = {
      fundId: 1,
      companyId,
      allocationVersion: 2,
      exitProbability: 0.8,
      exitMoicBps: 35000,
    };
    expect(result).toEqual({ response: expected, replayed: false });

    const committed = await lane.http.execute(sql`
      SELECT
        (SELECT allocation_version FROM portfoliocompanies WHERE id = ${companyId}) AS allocation_version,
        (SELECT count(*)::int FROM fund_events WHERE event_type = 'MOIC_INPUTS_UPDATED') AS event_count,
        (SELECT status FROM fund_moic_input_update_requests WHERE idempotency_key = ${input.idempotencyKey}) AS request_status
    `);
    expect(committed.rows[0]).toMatchObject({
      allocation_version: 2,
      event_count: 1,
      request_status: 'completed',
    });
    await expect(updateFundMoicInputs(input)).resolves.toEqual({
      response: expected,
      replayed: true,
    });
  });

  it('maps MOIC input version conflict without leaving a pending claim', async () => {
    await resetPostRepairTables();
    const inserted = await lane.http.execute(sql`
      INSERT INTO portfoliocompanies
        (fund_id, name, sector, stage, investment_amount)
      VALUES (1, 'Neon Lane Co', 'software', 'seed', 100000)
      RETURNING id
    `);
    const companyId = Number(inserted.rows[0]?.id);
    const database = lane.http as unknown as Parameters<typeof updateFundMoicInputs>[0]['database'];

    await expect(
      updateFundMoicInputs({
        fundId: 1,
        companyId,
        expectedVersion: 2,
        exitProbability: 0.8,
        exitMoicBps: 35000,
        idempotencyKey: 'neon-lane-moic-guard-failure',
        actorId: null,
        database,
      })
    ).rejects.toMatchObject({ code: 'stale_expected_version', actualVersion: 1 });

    const claims = await lane.http.execute(sql`
      SELECT count(*)::int AS count
      FROM fund_moic_input_update_requests
      WHERE idempotency_key = 'neon-lane-moic-guard-failure'
    `);
    expect(Number(claims.rows[0]?.count)).toBe(0);
  });
});

describe('post-repair current-forecast reference proofs', () => {
  it('pins pointer advance as class (b): neon-http still throws the driver error', async () => {
    // Escalated per plan: the guard-fenced CTE cannot deliver the
    // serial-order-equivalent both-succeed contract under READ COMMITTED.
    // The path keeps its callback transaction; Vercel runs the WebSocket
    // driver (server/db.ts) where transactions work.
    await resetPostRepairTables();
    await lane.http.execute(sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, activated_at, version)
      VALUES (1, 'current_forecast', 'on', NOW(), 1)
    `);
    const target = await insertLaneReference('neon-lane-pointer-pin');
    const database = lane.http as unknown as CurrentForecastReferenceDatabase;
    await expectExactNeonHttpError(() =>
      advanceCurrentForecastPointer({ fundId: 1, referenceId: target, actorId: null, database })
    );
  });

  it('proves pointer advance on the WebSocket driver and supersedes the old head', async () => {
    await resetPostRepairTables();
    await lane.http.execute(sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, activated_at, version)
      VALUES (1, 'current_forecast', 'on', NOW(), 1)
    `);
    const oldHead = await insertLaneReference('neon-lane-pointer-old', false);
    const target = await insertLaneReference('neon-lane-pointer-target');
    await lane.http.execute(sql`
      UPDATE fund_calculation_modes
      SET cutover_reference_id = ${oldHead}
      WHERE fund_id = 1 AND calculation_key = 'current_forecast'
    `);

    const database = lane.websocket as unknown as CurrentForecastReferenceDatabase;
    await expect(
      advanceCurrentForecastPointer({ fundId: 1, referenceId: target, actorId: null, database })
    ).resolves.toEqual({ cutoverReferenceId: target, version: 2 });

    const rows = await lane.http.execute(sql`
      SELECT
        (SELECT superseded_by_reference_id FROM current_forecast_references WHERE id = ${oldHead}) AS old_superseded_by,
        (SELECT candidate FROM current_forecast_references WHERE id = ${target}) AS target_candidate,
        (SELECT cutover_reference_id FROM fund_calculation_modes WHERE fund_id = 1) AS cutover_reference_id
    `);
    expect(rows.rows[0]).toMatchObject({
      old_superseded_by: target,
      target_candidate: false,
      cutover_reference_id: target,
    });
  });

  it('rejects pointer advance on the WebSocket driver when the mode guard fails', async () => {
    await resetPostRepairTables();
    await lane.http.execute(sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, version)
      VALUES (1, 'current_forecast', 'shadow', 1)
    `);
    const target = await insertLaneReference('neon-lane-pointer-guard');
    const database = lane.websocket as unknown as CurrentForecastReferenceDatabase;

    await expect(
      advanceCurrentForecastPointer({ fundId: 1, referenceId: target, actorId: null, database })
    ).rejects.toMatchObject({ code: 'pointer_advance_requires_on' });

    const rows = await lane.http.execute(sql`
      SELECT candidate FROM current_forecast_references WHERE id = ${target}
    `);
    expect(rows.rows[0]?.candidate).toBe(true);
  });

  it('proves activation latch completion and same-key replay on neon-http', async () => {
    await resetPostRepairTables();
    await lane.http.execute(sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, version)
      VALUES (1, 'current_forecast', 'shadow', 1)
    `);
    const target = await insertLaneReference('neon-lane-activation');
    const database = lane.http as unknown as CurrentForecastReferenceDatabase;
    const input = {
      fundId: 1,
      referenceId: target,
      expectedVersion: 1,
      idempotencyKey: 'neon-lane-activation',
      actorId: null,
      database,
      verifyGreenCandidate: async () => [],
    };

    const result = await activateCurrentForecast(input);
    expect(result.replayed).toBe(false);
    expect(result.response).toMatchObject({
      calculationKey: 'current_forecast',
      configuredMode: 'on',
      cutoverReferenceId: target,
      version: 2,
    });

    const committed = await lane.http.execute(sql`
      SELECT
        (SELECT candidate FROM current_forecast_references WHERE id = ${target}) AS candidate,
        (SELECT configured_mode FROM fund_calculation_modes WHERE fund_id = 1) AS configured_mode,
        (SELECT status FROM fund_calculation_mode_requests WHERE idempotency_key = 'neon-lane-activation') AS request_status
    `);
    expect(committed.rows[0]).toMatchObject({
      candidate: false,
      configured_mode: 'on',
      request_status: 'completed',
    });

    await expect(activateCurrentForecast(input)).resolves.toMatchObject({
      replayed: true,
      response: result.response,
    });
  });

  it('suppresses activation request when expected-version guard fails on neon-http', async () => {
    await resetPostRepairTables();
    await lane.http.execute(sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, version)
      VALUES (1, 'current_forecast', 'shadow', 2)
    `);
    const target = await insertLaneReference('neon-lane-activation-guard');
    const database = lane.http as unknown as CurrentForecastReferenceDatabase;

    await expect(
      activateCurrentForecast({
        fundId: 1,
        referenceId: target,
        expectedVersion: 1,
        idempotencyKey: 'neon-lane-activation-guard',
        actorId: null,
        database,
        verifyGreenCandidate: async () => [],
      })
    ).rejects.toMatchObject({ code: 'stale_expected_version' });

    const rows = await lane.http.execute(sql`
      SELECT count(*)::int AS count
      FROM fund_calculation_mode_requests
      WHERE idempotency_key = 'neon-lane-activation-guard'
    `);
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });

  it('proves metric-run approve and lock CAS lifecycle on neon-http', async () => {
    await resetPostRepairTables();
    await seedMetricRun();
    await lane.http.execute(sql`
      INSERT INTO evidence_records
        (fund_id, metric_run_id, idempotency_key, evidence_source, source_date)
      VALUES (1, 1, 'neon-lane-metric-evidence', 'board_update', '2026-08-07')
    `);
    const database = lane.http as unknown as NonNullable<
      Parameters<typeof approveMetricRun>[1]
    >['database'];
    const input = { fundId: 1, metricRunId: 1, userId: 1, expectedVersion: 1 };

    await expect(approveMetricRun(input, { database })).resolves.toMatchObject({ changed: true });
    await expect(
      lockMetricRun({ ...input, expectedVersion: 2 }, { database })
    ).resolves.toMatchObject({ changed: true });

    await resetPostRepairTables();
    await seedMetricRun('approved', 2);
    await expect(lockMetricRun(input, { database })).rejects.toMatchObject({
      code: 'METRIC_RUN_VERSION_CONFLICT',
    });
  });

  it('proves metric-run evidence insert and idempotent replay on neon-http', async () => {
    await resetPostRepairTables();
    await seedMetricRun();
    const database = lane.http as unknown as NonNullable<
      Parameters<typeof createMetricRunEvidence>[1]
    >['database'];
    const input = {
      fundId: 1,
      metricRunId: 1,
      userId: 1,
      body: {
        idempotencyKey: 'neon-lane-evidence',
        evidenceSource: 'board_update' as const,
        sourceDate: '2026-08-07',
      },
    };
    await expect(createMetricRunEvidence(input, { database })).resolves.toMatchObject({
      inserted: true,
    });
    await expect(createMetricRunEvidence(input, { database })).resolves.toMatchObject({
      inserted: false,
    });

    await resetPostRepairTables();
    await seedMetricRun('approved');
    await expect(createMetricRunEvidence(input, { database })).rejects.toMatchObject({
      code: 'METRIC_RUN_NOT_EDITABLE',
    });
  });

  it('proves narrative edit, review, approve and CAS conflict on neon-http', async () => {
    await resetPostRepairTables();
    await seedMetricRun('locked');
    await seedNarrativeRun();
    const database = lane.http as unknown as NonNullable<
      Parameters<typeof editNarrativeDraft>[1]
    >['database'];
    const editInput = {
      fundId: 1,
      metricRunId: 1,
      narrativeRunId: 1,
      userId: 1,
      body: { expectedVersion: 1, editedText: 'edited' },
    };
    const lifecycleInput = {
      fundId: 1,
      metricRunId: 1,
      narrativeRunId: 1,
      userId: 1,
      body: { expectedVersion: 1 },
    };

    await expect(editNarrativeDraft(editInput, { database })).resolves.toMatchObject({
      changed: true,
    });
    await expect(
      reviewNarrativeDraft({ ...lifecycleInput, body: { expectedVersion: 2 } }, { database })
    ).resolves.toMatchObject({ changed: true });
    await expect(
      approveNarrativeDraft({ ...lifecycleInput, body: { expectedVersion: 3 } }, { database })
    ).resolves.toMatchObject({ changed: true });

    await resetPostRepairTables();
    await seedMetricRun('locked');
    await seedNarrativeRun('draft', 2, 'already edited');
    await expect(editNarrativeDraft(editInput, { database })).rejects.toMatchObject({
      code: 'NARRATIVE_RUN_VERSION_CONFLICT',
    });
  });

  it('pins planning-FMV driver failure and failed idempotency row', async () => {
    const database = lane.http as unknown as NonNullable<
      Parameters<typeof createPlanningFmvOverride>[1]
    >['database'];
    const input = {
      fundId: 1,
      idempotencyKey: 'neon-lane-planning-fmv',
      actor: { userId: 1 },
      body: {
        companyId: 1,
        markDate: '2026-08-07',
        fairValue: '1000000',
        currency: 'USD' as const,
        confidenceLevel: 'medium' as const,
        reason: 'pre-repair pin',
        source: {},
      },
    };

    // Class-(b) driver pin remains: Vercel uses WebSocket driver after Batch 2;
    // neon-http still exposes its unsupported transaction primitive here.
    await expectExactNeonHttpError(() => createPlanningFmvOverride(input, { database }));

    const pendingRows = await lane.http.execute(sql`
      SELECT status
      FROM planning_fmv_override_requests
      WHERE fund_id = ${input.fundId}
        AND idempotency_key = ${input.idempotencyKey}
    `);
    expect(pendingRows.rows[0]?.status).toBe('failed');

    await expect(createPlanningFmvOverride(input, { database })).rejects.toMatchObject({
      code: 'planning_fmv_request_failed',
      status: 409,
    });
  });
});

describe('concurrent-writer contracts on neon-http', () => {
  it('serializes concurrent mode updates: one wins, loser maps to version conflict with no request row', async () => {
    await resetPostRepairTables();
    const database = lane.http as unknown as FundCalculationModeDatabase;
    const base = {
      fundId: 1,
      expectedVersion: 0,
      configuredMode: 'off' as const,
      actorId: null,
      sources: { sourceInputHash: 'neon-lane-source' },
      database,
    };

    const [first, second] = await Promise.allSettled([
      updateCurrentForecastCalculationMode({ ...base, idempotencyKey: 'concurrent-mode-a' }),
      updateCurrentForecastCalculationMode({ ...base, idempotencyKey: 'concurrent-mode-b' }),
    ]);

    const outcomes = [first, second];
    const wins = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const losses = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect((losses[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      FundCalculationModeVersionConflictError
    );

    const state = await lane.http.execute(sql`
      SELECT
        (SELECT version FROM fund_calculation_modes WHERE fund_id = 1 AND calculation_key = 'current_forecast') AS mode_version,
        (SELECT count(*)::int FROM fund_calculation_mode_requests WHERE status <> 'completed') AS non_completed,
        (SELECT count(*)::int FROM fund_calculation_mode_requests) AS total_requests
    `);
    expect(state.rows[0]).toMatchObject({ mode_version: 1, non_completed: 0, total_requests: 1 });
  });

  it('resolves concurrent same-key activation as one execution plus one ledger replay', async () => {
    await resetPostRepairTables();
    await lane.http.execute(sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, version)
      VALUES (1, 'current_forecast', 'shadow', 1)
    `);
    const target = await insertLaneReference('concurrent-activation');
    const database = lane.http as unknown as CurrentForecastReferenceDatabase;
    const input = {
      fundId: 1,
      referenceId: target,
      expectedVersion: 1,
      idempotencyKey: 'concurrent-activation',
      actorId: null,
      database,
      verifyGreenCandidate: async () => [],
    };

    const results = await Promise.all([
      activateCurrentForecast(input),
      activateCurrentForecast(input),
    ]);

    const replayFlags = results.map((result) => result.replayed).sort();
    expect(replayFlags).toEqual([false, true]);
    expect(results[0]?.response).toEqual(results[1]?.response);

    const state = await lane.http.execute(sql`
      SELECT
        (SELECT count(*)::int FROM fund_calculation_mode_requests WHERE idempotency_key = 'concurrent-activation') AS request_count,
        (SELECT configured_mode FROM fund_calculation_modes WHERE fund_id = 1) AS configured_mode,
        (SELECT version FROM fund_calculation_modes WHERE fund_id = 1) AS mode_version
    `);
    expect(state.rows[0]).toMatchObject({
      request_count: 1,
      configured_mode: 'on',
      mode_version: 2,
    });
  });

  it('lets concurrent pointer advances both succeed serial-order-equivalent with a single accepted head', async () => {
    await resetPostRepairTables();
    await lane.http.execute(sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, activated_at, version)
      VALUES (1, 'current_forecast', 'on', NOW(), 1)
    `);
    const initialHead = await insertLaneReference('concurrent-pointer-head', false);
    await lane.http.execute(sql`
      UPDATE fund_calculation_modes
      SET cutover_reference_id = ${initialHead}
      WHERE fund_id = 1 AND calculation_key = 'current_forecast'
    `);
    const targetA = await insertLaneReference('concurrent-pointer-a');
    const targetB = await insertLaneReference('concurrent-pointer-b');
    // Class (b): the pointer path runs its callback transaction on the
    // WebSocket driver (what Vercel now runs) - that is where the
    // serial-order-equivalent both-succeed contract must hold.
    const database = lane.websocket as unknown as CurrentForecastReferenceDatabase;

    const results = await Promise.all([
      advanceCurrentForecastPointer({ fundId: 1, referenceId: targetA, actorId: null, database }),
      advanceCurrentForecastPointer({ fundId: 1, referenceId: targetB, actorId: null, database }),
    ]);

    // Both succeed; the committed order determines the final head.
    expect(results.map((result) => result.cutoverReferenceId).sort()).toEqual(
      [targetA, targetB].sort()
    );
    expect(results.map((result) => result.version).sort()).toEqual([2, 3]);

    const state = await lane.http.execute(sql`
      SELECT
        (SELECT count(*)::int FROM current_forecast_references
          WHERE fund_id = 1 AND candidate = false AND superseded_by_reference_id IS NULL) AS accepted_heads,
        (SELECT cutover_reference_id FROM fund_calculation_modes WHERE fund_id = 1) AS final_head,
        (SELECT version FROM fund_calculation_modes WHERE fund_id = 1) AS mode_version
    `);
    const finalHead = Number(state.rows[0]?.final_head);
    expect(state.rows[0]).toMatchObject({ accepted_heads: 1, mode_version: 3 });
    expect([targetA, targetB]).toContain(finalHead);
  });

  it('serializes concurrent MOIC input updates: one wins, loser conflicts, no stranded claims', async () => {
    await resetPostRepairTables();
    const inserted = await lane.http.execute(sql`
      INSERT INTO portfoliocompanies
        (fund_id, name, sector, stage, investment_amount)
      VALUES (1, 'Concurrent Co', 'software', 'seed', 100000)
      RETURNING id
    `);
    const companyId = Number(inserted.rows[0]?.id);
    const database = lane.http as unknown as Parameters<typeof updateFundMoicInputs>[0]['database'];
    const base = {
      fundId: 1,
      companyId,
      expectedVersion: 1,
      exitProbability: 0.5,
      exitMoicBps: 20000,
      actorId: null,
      database,
    };

    const outcomes = await Promise.allSettled([
      updateFundMoicInputs({ ...base, idempotencyKey: 'concurrent-moic-a' }),
      updateFundMoicInputs({ ...base, idempotencyKey: 'concurrent-moic-b' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);

    const state = await lane.http.execute(sql`
      SELECT
        (SELECT allocation_version FROM portfoliocompanies WHERE id = ${companyId}) AS allocation_version,
        (SELECT count(*)::int FROM fund_moic_input_update_requests WHERE status <> 'completed') AS non_completed,
        (SELECT count(*)::int FROM fund_events) AS event_count
    `);
    expect(state.rows[0]).toMatchObject({
      allocation_version: 2,
      non_completed: 0,
      event_count: 1,
    });
  });

  it('resolves concurrent metric-run approvals idempotently: one changed, one same-approve retry', async () => {
    await resetPostRepairTables();
    await seedMetricRun();
    await lane.http.execute(sql`
      INSERT INTO evidence_records
        (fund_id, metric_run_id, idempotency_key, evidence_source, source_date)
      VALUES (1, 1, 'concurrent-approve-evidence', 'board_update', '2026-08-07')
    `);
    const database = lane.http as unknown as NonNullable<
      Parameters<typeof approveMetricRun>[1]
    >['database'];
    const input = { fundId: 1, metricRunId: 1, userId: 1, expectedVersion: 1 };

    const results = await Promise.all([
      approveMetricRun(input, { database }),
      approveMetricRun(input, { database }),
    ]);

    expect(results.map((result) => result.changed).sort()).toEqual([false, true]);
    const state = await lane.http.execute(sql`
      SELECT status, version FROM lp_metric_runs WHERE id = 1
    `);
    expect(state.rows[0]).toMatchObject({ status: 'approved', version: 2 });
  });
});
