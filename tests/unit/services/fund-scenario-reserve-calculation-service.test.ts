import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, identityQueryMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  identityQueryMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import {
  createReserveScenarioInputHash,
  getReserveScenarioCalculationIdentity,
  isScenarioCalculationOwnershipLost,
  runReserveScenarioCalculation,
} from '../../../server/services/fund-scenario-reserve-calculation-service';
import * as calculationRunService from '../../../server/services/fund-scenario-calculation-run-service';
import * as reserveInputBuilder from '../../../server/services/reserve-input-builder';
import * as scenarioSetService from '../../../server/services/fund-scenario-set-service';
import { persistReserveScenarioSnapshot } from '../../../server/services/fund-scenario-reserve-snapshot-store';
import * as snapshotStore from '../../../server/services/fund-scenario-reserve-snapshot-store';
import type { FundScenarioCalculationPayloadV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const identityScenarioSetId = '11111111-1111-4111-8111-111111111111';

const calculationInput = {
  fundId: 1,
  scenarioSetId: identityScenarioSetId,
  correlationId: '44444444-4444-4444-8444-444444444444',
  actor: {},
  jobId: 'job-orchestration',
};

const orchestrationRun = {
  id: '33333333-3333-4333-8333-333333333333',
  fundId: 1,
  scenarioSetId: identityScenarioSetId,
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  calculationMode: 'async_reserve_allocation' as const,
  overrideType: 'reserve_allocation' as const,
  inputHash: 'a'.repeat(64),
  hashKind: 'scenario-input-hash-v2' as const,
  modelInputsAsOfDate: '2026-06-30',
  comparisonLineageVersion: 'comparison-lineage-v1' as const,
  jobId: calculationInput.jobId,
  correlationId: calculationInput.correlationId,
  status: 'running' as const,
  snapshotId: null,
};

const orchestrationScenarioSet = {
  id: identityScenarioSetId,
  fundId: 1,
  name: 'Reserve sensitivity',
  description: null,
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  variantCount: 1,
  archivedAt: null,
  archivedByUserId: null,
  archivedByLabel: null,
  createdByUserId: 7,
  createdByLabel: 'owner@example.com',
  updatedByUserId: 7,
  updatedByLabel: 'owner@example.com',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  variants: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      scenarioSetId: identityScenarioSetId,
      name: 'Reserve variant',
      description: null,
      sortOrder: 0,
      override: {
        overrideType: 'reserve_allocation' as const,
        payload: {
          allocationVersion: null,
          items: [{ companyId: 1, plannedReservesCents: 1000 }],
        },
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
};

const reserveResponse = {
  snapshotId: 42,
  payload: {
    version: 'fund-scenarios-v1',
    calculationMode: 'async_reserve_allocation',
    fundId: 1,
    scenarioSetId: identityScenarioSetId,
    sourceConfigId: 2,
    sourceConfigVersion: 3,
    staleness: {
      state: 'CURRENT',
      sourceConfigVersion: 3,
      currentPublishedConfigVersion: 3,
    },
    calculatedAt: '2026-06-30T00:00:00.000Z',
    variants: [],
  },
};

function mockIdentityQueries(config: unknown): void {
  identityQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({
      rows: [
        {
          id: identityScenarioSetId,
          fund_id: 1,
          name: 'Reserve sensitivity',
          description: null,
          source_config_id: 2,
          source_config_version: 3,
          created_by_user_id: 7,
          created_by_label: 'owner@example.com',
          updated_by_user_id: 7,
          updated_by_label: 'owner@example.com',
          archived_at: null,
          archived_by_user_id: null,
          archived_by_label: null,
          created_at: new Date('2026-06-01T00:00:00.000Z'),
          updated_at: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          scenario_set_id: identityScenarioSetId,
          name: 'Reserve variant',
          description: null,
          sort_order: 0,
          override_type: 'reserve_allocation',
          override_payload: {
            allocationVersion: null,
            items: [{ companyId: 1, plannedReservesCents: 1000 }],
          },
          created_at: new Date('2026-06-01T00:00:00.000Z'),
          updated_at: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [{ id: 2, version: 3, config }] })
    .mockResolvedValueOnce({ rows: [{ version: 3 }] });
}

function configureOrchestration(options: {
  currentDate?: string | undefined;
  completedResponse?: typeof reserveResponse | null;
  claimResult?: Record<string, unknown> | null;
  completionResult?: Record<string, unknown> | null;
  failureResult?: Record<string, unknown> | null;
  failureError?: Error | null;
} = {}): { order: string[]; events: Array<Record<string, unknown>> } {
  const order: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  let transactionNumber = 0;

  vi.spyOn(scenarioSetService, 'verifyFundExists').mockResolvedValue(undefined);
  vi.spyOn(scenarioSetService, 'fetchScenarioSetDetail').mockResolvedValue(
    orchestrationScenarioSet as never
  );
  vi.spyOn(calculationRunService, 'findCompletedScenarioRun').mockResolvedValue(
    options.completedResponse ? { ...orchestrationRun, status: 'completed', snapshotId: 42 } : null
  );
  vi.spyOn(calculationRunService, 'acquireScenarioCalculationRun').mockResolvedValue({
    ...orchestrationRun,
    status: 'queued',
  });
  vi.spyOn(calculationRunService, 'claimScenarioCalculationRunIfQueued').mockResolvedValue(
    options.claimResult === undefined ? orchestrationRun : (options.claimResult as never)
  );
  vi.spyOn(calculationRunService, 'completeScenarioCalculationRunIfRunning').mockResolvedValue(
    options.completionResult === undefined
      ? ({ ...orchestrationRun, status: 'completed', snapshotId: 42 } as never)
      : (options.completionResult as never)
  );
  const failureSpy = vi
    .spyOn(calculationRunService, 'failScenarioCalculationRunIfRunning')
    .mockImplementation(async () => {
      order.push('failure-cas');
      if (options.failureError) throw options.failureError;
      return options.failureResult === undefined
        ? ({ ...orchestrationRun, status: 'failed' } as never)
        : (options.failureResult as never);
    });
  void failureSpy;

  vi.spyOn(scenarioSetService, 'insertScenarioSetEvent').mockImplementation(
    async (_client, event) => {
      const eventRecord = event as unknown as Record<string, unknown>;
      events.push(eventRecord);
      order.push(`event:${String(eventRecord.eventType)}`);
    }
  );
  vi.spyOn(reserveInputBuilder, 'buildReservePortfolioInputForClientWithProvenance').mockImplementation(
    async () => {
      order.push('expensive-input');
      return {
        portfolio: [],
        reserveInputTrustSummary: {
          trustedForActivation: true,
          defaultedInputCount: 0,
          unavailableInputCount: 0,
          defaultedFields: [],
          unavailableFields: [],
        },
      };
    }
  );
  vi.spyOn(snapshotStore, 'findReusableReserveScenarioSnapshot').mockResolvedValue(
    options.completedResponse
      ? (options.completedResponse as never)
      : null
  );
  vi.spyOn(snapshotStore, 'persistReserveScenarioSnapshot').mockImplementation(async () => {
    order.push('snapshot');
    return reserveResponse as never;
  });

  transactionMock.mockImplementation(async (callback: (client: { query: typeof identityQueryMock }) => unknown) => {
    const transactionId = ++transactionNumber;
    order.push(`tx${transactionId}:begin`);
    const client = {
      query: vi.fn(async (sqlValue: unknown) => {
        const sql = String(sqlValue);
        if (sql.includes('SELECT id, version, config')) {
          return {
            rows: [{ id: 2, version: 3, config: { fundName: 'Reserve Fund', ...(options.currentDate ? { modelInputsAsOfDate: options.currentDate } : { modelInputsAsOfDate: '2026-06-30' }) } }],
          };
        }
        if (sql.includes('is_published = TRUE')) return { rows: [{ version: 3 }] };
        if (sql.includes('SELECT size FROM funds')) return { rows: [{ size: '1000000' }] };
        if (sql.includes('FROM fund_scenario_sets')) {
          order.push('scenario-lock');
          return { rows: [{ id: identityScenarioSetId }] };
        }
        return { rows: [] };
      }),
    };
    try {
      const result = await callback(client);
      order.push(`tx${transactionId}:commit`);
      return result;
    } catch (error) {
      order.push(`tx${transactionId}:rollback`);
      throw error;
    }
  });

  return { order, events };
}

describe('fund scenario reserve calculation service', () => {
  beforeEach(() => {
    identityQueryMock.mockReset();
    transactionMock
      .mockReset()
      .mockImplementation(
        async (callback: (client: { query: typeof identityQueryMock }) => unknown) =>
          callback({ query: identityQueryMock })
      );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an already-aborted signal before opening a transaction or recording started', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runReserveScenarioCalculation({
        fundId: 1,
        scenarioSetId: identityScenarioSetId,
        correlationId: '33333333-3333-4333-8333-333333333333',
        actor: {},
        jobId: 'job-aborted',
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(identityQueryMock).not.toHaveBeenCalled();
  });

  it('commits Transaction A before expensive work and carries the exact run id through completion', async () => {
    const { order, events } = configureOrchestration();

    await expect(runReserveScenarioCalculation(calculationInput)).resolves.toEqual(reserveResponse);

    expect(order.indexOf('tx1:commit')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('tx1:commit')).toBeLessThan(order.indexOf('expensive-input'));
    expect(order.indexOf('tx1:commit')).toBeLessThan(order.indexOf('snapshot'));
    expect(events.map((event) => event.eventType)).toEqual(['calculation_started', 'calculated']);
    for (const event of events) {
      expect(event.changeSummary).toMatchObject({ run_id: orchestrationRun.id });
    }
  });

  it('returns a private benign outcome for a lost claim without work or failure persistence', async () => {
    const { order, events } = configureOrchestration({ claimResult: null });

    const result = await runReserveScenarioCalculation(calculationInput);

    expect(isScenarioCalculationOwnershipLost(result)).toBe(true);
    expect(order).not.toContain('expensive-input');
    expect(order).not.toContain('snapshot');
    expect(events).toEqual([]);
    expect(calculationRunService.failScenarioCalculationRunIfRunning).not.toHaveBeenCalled();
  });

  it('does not acquire or create a run for a stale fenced delivery', async () => {
    const { order, events } = configureOrchestration();
    vi.mocked(calculationRunService.claimScenarioCalculationRunIfQueued).mockResolvedValue(null);

    const result = await runReserveScenarioCalculation({
      ...calculationInput,
      runId: 'stale-run-id',
    });

    expect(isScenarioCalculationOwnershipLost(result)).toBe(true);
    expect(calculationRunService.claimScenarioCalculationRunIfQueued).toHaveBeenCalledWith(
      expect.anything(),
      'stale-run-id',
      expect.objectContaining({ jobId: calculationInput.jobId })
    );
    expect(calculationRunService.acquireScenarioCalculationRun).not.toHaveBeenCalled();
    expect(order).not.toContain('expensive-input');
    expect(events).toEqual([]);
  });

  it('reuses a completed snapshot without claiming or recalculating', async () => {
    const { order, events } = configureOrchestration({ completedResponse: reserveResponse });

    await expect(runReserveScenarioCalculation(calculationInput)).resolves.toEqual(reserveResponse);

    expect(order).not.toContain('expensive-input');
    expect(order).not.toContain('snapshot');
    expect(events).toEqual([]);
    expect(calculationRunService.claimScenarioCalculationRunIfQueued).not.toHaveBeenCalled();
  });

  it('rolls back completion work when the running CAS loses and emits no late event or failure', async () => {
    const { order, events } = configureOrchestration({ completionResult: null });

    const result = await runReserveScenarioCalculation(calculationInput);
    expect(isScenarioCalculationOwnershipLost(result)).toBe(true);

    expect(order).toContain('snapshot');
    expect(order).toContain('tx2:rollback');
    expect(events.map((event) => event.eventType)).toEqual(['calculation_started']);
    expect(calculationRunService.failScenarioCalculationRunIfRunning).not.toHaveBeenCalled();
  });

  it('persists a failure event only after the winning running CAS, with scenario lock first', async () => {
    const originalError = new Error('calculation exploded');
    const { order, events } = configureOrchestration();
    vi.spyOn(snapshotStore, 'persistReserveScenarioSnapshot').mockRejectedValue(originalError);

    await expect(runReserveScenarioCalculation(calculationInput)).rejects.toBe(originalError);

    expect(events.map((event) => event.eventType)).toEqual([
      'calculation_started',
      'calculation_failed',
    ]);
    expect(events[1]?.changeSummary).toMatchObject({ run_id: orchestrationRun.id });
    expect(order.indexOf('scenario-lock')).toBeLessThan(order.indexOf('failure-cas'));
    expect(order.indexOf('failure-cas')).toBeLessThan(order.indexOf('event:calculation_failed'));
  });

  it('rethrows the original calculation error when failure persistence itself fails', async () => {
    const originalError = new Error('original calculation error');
    const persistenceError = new Error('failure persistence unavailable');
    configureOrchestration({ failureError: persistenceError });
    vi.spyOn(snapshotStore, 'persistReserveScenarioSnapshot').mockRejectedValue(originalError);

    await expect(runReserveScenarioCalculation(calculationInput)).rejects.toBe(originalError);
    expect(calculationRunService.failScenarioCalculationRunIfRunning).toHaveBeenCalledTimes(1);
    expect(scenarioSetService.insertScenarioSetEvent).toHaveBeenCalledTimes(1);
  });

  it('does not emit a failure event when the running failure CAS loses', async () => {
    const originalError = new Error('calculation failed after another owner won');
    const { events } = configureOrchestration({ failureResult: null });
    vi.spyOn(snapshotStore, 'persistReserveScenarioSnapshot').mockRejectedValue(originalError);

    await expect(runReserveScenarioCalculation(calculationInput)).rejects.toBe(originalError);

    expect(events.map((event) => event.eventType)).toEqual(['calculation_started']);
    expect(calculationRunService.failScenarioCalculationRunIfRunning).toHaveBeenCalledTimes(1);
  });

  it('fails the claimed run when the current identity drifts before completion', async () => {
    let sourceConfigReads = 0;
    identityQueryMock.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.includes('SELECT id FROM funds')) {
        return { rows: [{ id: 1 }] };
      }
      if (sql.includes('FROM fund_scenario_sets s')) {
        return {
          rows: [
            {
              id: identityScenarioSetId,
              fund_id: 1,
              name: 'Reserve sensitivity',
              description: null,
              source_config_id: 2,
              source_config_version: 3,
              created_by_user_id: 7,
              created_by_label: 'owner@example.com',
              updated_by_user_id: 7,
              updated_by_label: 'owner@example.com',
              archived_at: null,
              archived_by_user_id: null,
              archived_by_label: null,
              created_at: new Date('2026-06-01T00:00:00.000Z'),
              updated_at: new Date('2026-06-01T00:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM fund_scenario_variants')) {
        return {
          rows: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              scenario_set_id: identityScenarioSetId,
              name: 'Reserve variant',
              description: null,
              sort_order: 0,
              override_type: 'reserve_allocation',
              override_payload: {
                allocationVersion: null,
                items: orchestrationScenarioSet.variants[0]!.override.payload.items,
              },
              created_at: new Date('2026-06-01T00:00:00.000Z'),
              updated_at: new Date('2026-06-01T00:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM fundconfigs') && sql.includes('id = $2')) {
        sourceConfigReads += 1;
        return {
          rows: [
            {
              id: 2,
              version: 3,
              config: {
                fundName: 'Reserve Fund',
                modelInputsAsOfDate: sourceConfigReads === 1 ? '2026-06-30' : '2026-07-31',
              },
            },
          ],
        };
      }
      if (sql.includes('is_published = TRUE')) {
        return { rows: [{ version: 3 }] };
      }
      if (sql.includes('SELECT size FROM funds')) {
        return { rows: [{ size: '1000000' }] };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ id: identityScenarioSetId }] };
      }
      return { rows: [] };
    });

    const runRow = {
      ...orchestrationRun,
      jobId: 'job-drift',
      correlationId: '44444444-4444-4444-8444-444444444444',
    };
    const findCompletedSpy = vi
      .spyOn(calculationRunService, 'findCompletedScenarioRun')
      .mockResolvedValue(null);
    const acquireSpy = vi
      .spyOn(calculationRunService, 'acquireScenarioCalculationRun')
      .mockResolvedValue({ ...runRow, status: 'queued' });
    const claimSpy = vi
      .spyOn(calculationRunService, 'claimScenarioCalculationRunIfQueued')
      .mockResolvedValue(runRow);
    const failSpy = vi
      .spyOn(calculationRunService, 'failScenarioCalculationRunIfRunning')
      .mockImplementation(async () => {
        expect(
          identityQueryMock.mock.calls.some((call) => String(call[0]).includes('FOR UPDATE'))
        ).toBe(true);
        return { ...runRow, status: 'failed' };
      });
    const eventSpy = vi.spyOn(scenarioSetService, 'insertScenarioSetEvent').mockResolvedValue();
    const buildSpy = vi
      .spyOn(reserveInputBuilder, 'buildReservePortfolioInputForClientWithProvenance')
      .mockResolvedValue({
        portfolio: [],
        reserveInputTrustSummary: {
          trustedForActivation: true,
          defaultedInputCount: 0,
          unavailableInputCount: 0,
          defaultedFields: [],
          unavailableFields: [],
        },
      });
    const persistSpy = vi
      .spyOn(snapshotStore, 'persistReserveScenarioSnapshot')
      .mockResolvedValue(reserveResponse);

    try {
      await expect(
        runReserveScenarioCalculation({
          ...calculationInput,
          jobId: 'job-drift',
        })
      ).rejects.toMatchObject({ name: 'ScenarioRunIdentityDriftError' });

      expect(persistSpy).not.toHaveBeenCalled();
      expect(failSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls.map((call) => call[1].eventType)).toEqual([
        'calculation_started',
        'calculation_failed',
      ]);
      const startedSummary = eventSpy.mock.calls[0]?.[1].changeSummary as Record<string, unknown>;
      expect(eventSpy.mock.calls[1]?.[1].changeSummary).toMatchObject({
        run_id: runRow.id,
        input_hash: startedSummary.input_hash,
      });
      expect(findCompletedSpy).toHaveBeenCalledTimes(1);
      expect(acquireSpy).toHaveBeenCalledTimes(1);
      expect(claimSpy).toHaveBeenCalledTimes(1);
      expect(buildSpy).not.toHaveBeenCalled();
    } finally {
      findCompletedSpy.mockRestore();
      acquireSpy.mockRestore();
      claimSpy.mockRestore();
      failSpy.mockRestore();
      eventSpy.mockRestore();
      buildSpy.mockRestore();
      persistSpy.mockRestore();
    }
  });

  it.each([
    {
      label: 'eligible dated config',
      config: { fundName: 'Reserve Fund', modelInputsAsOfDate: '2026-06-30' },
      expectedLineage: {
        hashKind: 'scenario-input-hash-v2',
        modelInputsAsOfDate: '2026-06-30',
        comparisonLineageVersion: 'comparison-lineage-v1',
      },
    },
    {
      label: 'undated legacy config',
      config: { fundName: 'Legacy Reserve Fund' },
      expectedLineage: {
        hashKind: 'scenario-input-hash-v1',
        modelInputsAsOfDate: null,
        comparisonLineageVersion: null,
      },
    },
    {
      label: 'legacy create-format config',
      config: { name: 'Legacy Reserve Fund' },
      expectedLineage: {
        hashKind: 'scenario-input-hash-v1',
        modelInputsAsOfDate: null,
        comparisonLineageVersion: null,
      },
    },
  ])('derives async run lineage from the pinned $label', async ({ config, expectedLineage }) => {
    mockIdentityQueries(config);

    const result = await getReserveScenarioCalculationIdentity(1, identityScenarioSetId);

    expect(result.inputLineage).toEqual(expectedLineage);
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(identityQueryMock.mock.calls[3]?.[0])).toContain('SELECT id, version, config');
  });

  it.each([
    {
      label: 'ambiguous canonical and legacy names',
      config: { fundName: 'Canonical Fund', name: 'Legacy Fund' },
      rejectedKey: 'name',
    },
    {
      label: 'unrelated unknown fields on a legacy config',
      config: { name: 'Legacy Fund', unexpected: true },
      rejectedKey: 'unexpected',
    },
  ])('rejects $label', async ({ config, rejectedKey }) => {
    mockIdentityQueries(config);

    await expect(
      getReserveScenarioCalculationIdentity(1, identityScenarioSetId)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'scenario_source_config_invalid',
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining(rejectedKey) }),
        ]),
      },
    });
    expect(identityQueryMock).toHaveBeenCalledTimes(4);
  });

  it('creates a stable input hash regardless of equivalent variant ordering', () => {
    const first = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sortOrder: 1,
          override: { b: 2, a: 1 },
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 2,
          override: { amountCents: 1000 },
        },
      ],
    });

    const second = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 2,
          override: { amountCents: 1000 },
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sortOrder: 1,
          override: { a: 1, b: 2 },
        },
      ],
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('cuts over to a date-bound v2 hash while preserving undated legacy v1 hashing', () => {
    const input = {
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation' as const,
      variants: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 1,
          override: { amountCents: 1000 },
        },
      ],
    };

    const legacyHash = createReserveScenarioInputHash(input);
    const juneHash = createReserveScenarioInputHash({
      ...input,
      modelInputsAsOfDate: '2026-06-30',
    });
    const julyHash = createReserveScenarioInputHash({
      ...input,
      modelInputsAsOfDate: '2026-07-31',
    });

    expect(juneHash).not.toBe(legacyHash);
    expect(juneHash).not.toBe(julyHash);
    expect(juneHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stamps reserve input trust summary metadata on scenario snapshots', async () => {
    const reservePayload: FundScenarioCalculationPayloadV1 = {
      version: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      staleness: {
        state: 'CURRENT',
        sourceConfigVersion: 3,
        currentPublishedConfigVersion: 3,
      },
      calculatedAt: '2026-05-29T00:00:00.000Z',
      variants: [
        {
          variantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          scenarioSetId: '11111111-1111-4111-8111-111111111111',
          name: 'Reserve variant',
          overrideType: 'reserve_allocation',
          reserve: {
            fundId: 1,
            totalBaseAllocationCents: 0,
            totalScenarioAllocationCents: 1000,
            totalAllocationDeltaCents: 1000,
            avgConfidence: 1,
            highConfidenceCount: 1,
            allocations: [
              {
                companyId: 1,
                baseAllocationCents: 0,
                plannedReservesCents: 1000,
                maxAllocationCents: null,
                scenarioAllocationCents: 1000,
                allocationDeltaCents: 1000,
                capApplied: false,
                confidence: 1,
                rationale: 'unit test',
              },
            ],
            warnings: [],
            generatedAt: '2026-05-29T00:00:00.000Z',
          },
        },
      ],
    };
    let capturedScenarioSnapshotMetadata:
      ({ reserve_input_trust_summary_hash?: string } & Record<string, unknown>) | undefined;
    const queryMock = vi.fn(async (_sql: string, values: unknown[]) => {
      capturedScenarioSnapshotMetadata = values[4] as {
        reserve_input_trust_summary_hash?: string;
      } & Record<string, unknown>;
      return {
        rows: [
          {
            id: 202,
            payload: reservePayload,
            correlation_id: '11111111-1111-4111-8111-111111111113',
            created_at: new Date(),
            snapshot_time: new Date(),
          },
        ],
      };
    });

    await persistReserveScenarioSnapshot({ query: queryMock } as never, {
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      correlationId: '11111111-1111-4111-8111-111111111113',
      payload: reservePayload,
      inputHash: 'b'.repeat(64),
      variantCount: 1,
      companyCount: 1,
      warningCount: 0,
      reserveInputTrustSummary: {
        trustedForActivation: false,
        defaultedInputCount: 2,
        unavailableInputCount: 0,
        defaultedFields: ['ownership', 'stage'],
        unavailableFields: [],
      },
    });

    expect(capturedScenarioSnapshotMetadata).toMatchObject({
      reserve_input_trust_summary: {
        trustedForActivation: false,
        defaultedFields: ['ownership', 'stage'],
      },
    });
    expect(capturedScenarioSnapshotMetadata!.reserve_input_trust_summary_hash).toMatch(
      /^[a-f0-9]{64}$/
    );
  });
});
