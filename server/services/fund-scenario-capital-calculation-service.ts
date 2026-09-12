import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { PoolClient } from 'pg';
import {
  CAPITAL_PLANNING_VERSION,
  CAPITAL_PREIMAGE_VERSION,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
} from '@shared/contracts/capital-planning-v1.contract';
import type { FundScenarioCapitalCalculationPayloadV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import { sha256CanonicalJson } from '@shared/lib/canonical-json';
import { calculateCapitalPlanningV1 } from '@shared/lib/capital-planning/capital-planning-v1';
import { CapitalPlanningCalculationError } from '@shared/lib/capital-planning/calculation-support';
import { verifyPinnedCapitalSourceBundle } from '@shared/lib/capital-planning/materialize-from-fund-draft';
import {
  FUND_SCENARIOS_CONTRACT_VERSION,
  resolveScenarioInputLineage,
} from '@shared/lib/scenarios/scenario-input-envelope';
import { transaction } from '../db/pg-circuit.js';
import { createCapitalScenarioInputHash } from '../lib/scenarios/scenario-input-hash.js';
import {
  acquireScenarioCalculationRunWithCreation,
  findCompletedScenarioRun,
  findLatestScenarioRun,
  markScenarioCalculationRunCompleted,
  markScenarioCalculationRunRunning,
  type ScenarioCalculationRunFenceIdentity,
  type ScenarioCalculationRunIdentity,
  type ScenarioCalculationRunRecord,
} from './fund-scenario-calculation-run-service.js';
import {
  findReusableCapitalScenarioSnapshot,
  persistCapitalScenarioSnapshot,
  prepareCapitalCalculateResponse,
} from './fund-scenario-capital-snapshot-store.js';
import type { CapitalSavedScenarioContext } from './fund-scenario-capital-read-service.js';
import { assertCapitalScenarioStoredInputLimits } from './fund-scenario-set-create-service.js';
import {
  createHttpError,
  fetchCapitalScenarioSetDetailFromRaw,
  fetchRawScenarioSet,
  insertScenarioSetEvent,
  normalizeActor,
  requireScenarioSetFamily,
  verifyFundExists,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';

export const CAPITAL_SCENARIO_CALC_VERSION = '1.0.0';
const SYNC_TIMEOUT_MS = 5000;
type RunLookup = Omit<ScenarioCalculationRunIdentity, 'correlationId' | 'jobId'>;

function assertWithinSyncDeadline(startedAt: number): void {
  if (performance.now() - startedAt <= SYNC_TIMEOUT_MS) return;
  throw createHttpError(503, 'Capital calculation exceeded its synchronous deadline', {
    code: 'scenario_calculation_timeout',
  });
}

function assertRunIdentity(run: ScenarioCalculationRunRecord, identity: RunLookup): void {
  if (
    run.fundId !== identity.fundId ||
    run.scenarioSetId !== identity.scenarioSetId ||
    run.sourceConfigId !== identity.sourceConfigId ||
    run.sourceConfigVersion !== identity.sourceConfigVersion ||
    run.calculationMode !== identity.calculationMode ||
    run.overrideType !== identity.overrideType ||
    run.inputHash !== identity.inputHash ||
    (run.hashKind ?? 'scenario-input-hash-v1') !== identity.hashKind ||
    run.modelInputsAsOfDate !== identity.modelInputsAsOfDate ||
    run.comparisonLineageVersion !== identity.comparisonLineageVersion ||
    run.jobId != null
  ) {
    throw createHttpError(500, 'Stored capital calculation identity is inconsistent', {
      code: 'scenario_saved_data_invalid',
    });
  }
}

async function completedResponse(
  client: PoolClient,
  run: ScenarioCalculationRunRecord,
  identity: RunLookup,
  saved: CapitalSavedScenarioContext
): Promise<ReturnType<typeof prepareCapitalCalculateResponse>> {
  assertRunIdentity(run, identity);
  const snapshot =
    run.snapshotId === null
      ? null
      : await findReusableCapitalScenarioSnapshot(
          client,
          {
            ...identity,
            snapshotId: run.snapshotId,
            calculationVersion: CAPITAL_SCENARIO_CALC_VERSION,
          },
          saved
        );
  if (!snapshot || snapshot.correlationId !== run.correlationId) {
    throw createHttpError(500, 'Completed capital calculation has no matching saved snapshot', {
      code: 'scenario_saved_data_invalid',
    });
  }
  return prepareCapitalCalculateResponse(snapshot);
}

async function verifyHistoricalSource(client: PoolClient, saved: CapitalSavedScenarioContext) {
  const source = saved.variants[0]!.override.payload.sourceBundle;
  const result = await client.query<{ id: number; version: number; config: unknown }>(
    `SELECT id, version, config FROM fundconfigs
      WHERE fund_id = $1 AND id = $2 AND version = $3
      FOR SHARE`,
    [saved.fundId, saved.sourceConfigId, saved.sourceConfigVersion]
  );
  const historical = result.rows[0];
  if (
    !historical ||
    historical.id !== saved.sourceConfigId ||
    historical.version !== saved.sourceConfigVersion ||
    sha256CanonicalJson(historical.config) !== source.projection.rawConfigHash
  ) {
    throw new CapitalPlanningCalculationError([
      {
        code: 'HISTORICAL_SOURCE_INTEGRITY_FAILED',
        path: 'sourceBundle.projection.rawConfigHash',
        message: 'The pinned historical configuration is missing or changed',
        support: 'invalid',
      },
    ]);
  }
  const verification = verifyPinnedCapitalSourceBundle({
    sourceBundle: source,
    savedProjection: source.projection,
    inputs: saved.variants.map((variant) => variant.override.payload.input),
  });
  if (!verification.ok) throw new CapitalPlanningCalculationError(verification.issues);
}

/** One durable transaction owns fresh work; completed replay uses saved bytes only. */
export async function calculateFundScenarioCapitalSet(
  fundId: number,
  scenarioSetId: string,
  actorInput: FundScenarioMutationActor = {}
): Promise<ReturnType<typeof prepareCapitalCalculateResponse>> {
  const startedAt = performance.now();
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const raw = await fetchRawScenarioSet(client, fundId, scenarioSetId, { forUpdate: true });
    requireScenarioSetFamily(raw, 'capital_plan');
    if (raw.row.archived_at !== null) {
      throw createHttpError(409, `Scenario set ${scenarioSetId} is archived`, {
        code: 'scenario_set_archived',
      });
    }
    const saved = await fetchCapitalScenarioSetDetailFromRaw(client, raw, {
      readCurrentSource: false,
    });
    const source = saved.variants[0]!.override.payload.sourceBundle;
    const lineage = resolveScenarioInputLineage(source.modelInputsAsOfDate ?? undefined);
    const envelope = {
      contractVersion: FUND_SCENARIOS_CONTRACT_VERSION,
      fundId,
      scenarioSetId,
      sourceConfigId: saved.sourceConfigId,
      sourceConfigVersion: saved.sourceConfigVersion,
      calculationDomain: 'capital_plan' as const,
      calculationMode: 'sync_capital_plan' as const,
      overrideType: 'capital_plan' as const,
      capitalPreimageVersion: CAPITAL_PREIMAGE_VERSION,
      methodVersion: CAPITAL_PLANNING_VERSION,
      interpretationVersion: saved.interpretationVersion,
      engineVersion: CAPITAL_SCENARIO_CALC_VERSION,
      baselineVariantId: saved.baselineVariantId,
      sourceBundleHash: saved.sourceBundleHash,
      variants: saved.variants.map((variant) => ({
        variantId: variant.id,
        sortOrder: variant.sortOrder,
        override: variant.override,
      })),
    };
    const inputHash = createCapitalScenarioInputHash(
      lineage.hashKind === 'scenario-input-hash-v2'
        ? {
            ...envelope,
            version: lineage.hashKind,
            modelInputsAsOfDate: lineage.modelInputsAsOfDate,
          }
        : { ...envelope, version: lineage.hashKind }
    );
    const identity: RunLookup = {
      fundId,
      scenarioSetId,
      sourceConfigId: saved.sourceConfigId,
      sourceConfigVersion: saved.sourceConfigVersion,
      calculationMode: 'sync_capital_plan',
      overrideType: 'capital_plan',
      inputHash,
      ...lineage,
    };
    const completed = await findCompletedScenarioRun(client, identity);
    if (completed) return completedResponse(client, completed, identity, saved);

    if (saved.interpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION) {
      throw new CapitalPlanningCalculationError([
        {
          code: 'INTERPRETATION_VERSION_UNSUPPORTED',
          path: 'interpretationVersion',
          message: 'The saved interpretation cannot start a new calculation',
          support: 'unsupported',
        },
      ]);
    }
    assertCapitalScenarioStoredInputLimits(saved.variants.map((variant) => variant.override));
    await verifyHistoricalSource(client, saved);
    const latest = await findLatestScenarioRun(client, identity);
    if (latest) {
      assertRunIdentity(latest, identity);
      if (latest.status === 'queued' || latest.status === 'running') {
        throw createHttpError(409, 'Capital scenario calculation is already in progress', {
          code: 'scenario_calculation_in_progress',
        });
      }
    }
    const correlationId = randomUUID();
    const fence: ScenarioCalculationRunFenceIdentity = { ...identity, jobId: null };
    const acquired = await acquireScenarioCalculationRunWithCreation(client, {
      ...identity,
      correlationId,
      jobId: null,
    });
    assertRunIdentity(acquired.run, identity);
    if (acquired.inserted && acquired.run.correlationId !== correlationId) {
      throw createHttpError(500, 'New capital calculation correlation identity is inconsistent', {
        code: 'scenario_saved_data_invalid',
      });
    }
    if (!acquired.inserted) {
      if (acquired.run.status === 'completed') {
        return completedResponse(client, acquired.run, identity, saved);
      }
      throw createHttpError(409, 'Capital scenario calculation is already in progress', {
        code: 'scenario_calculation_in_progress',
      });
    }
    if ((await markScenarioCalculationRunRunning(client, acquired.run.id, fence)) !== 1) {
      throw createHttpError(409, 'Capital calculation ownership was lost', {
        code: 'scenario_calculation_ownership_lost',
      });
    }
    const variants = saved.variants.map((variant) => {
      const stored = variant.override.payload;
      const result = calculateCapitalPlanningV1({
        input: stored.input,
        sourceBundle: stored.sourceBundle,
        ...(stored.benchmarkSnapshots === undefined
          ? {}
          : { benchmarkSnapshots: stored.benchmarkSnapshots }),
      });
      return {
        variantId: variant.id,
        scenarioSetId,
        name: variant.name,
        overrideType: 'capital_plan' as const,
        result,
      };
    });
    const payload: FundScenarioCapitalCalculationPayloadV1 = {
      contractVersion: 'fund-scenario-capital-calculation/1.0.0',
      calculationDomain: 'capital_plan',
      calculationMode: 'sync_capital_plan',
      capitalPreimageVersion: CAPITAL_PREIMAGE_VERSION,
      methodVersion: CAPITAL_PLANNING_VERSION,
      interpretationVersion: saved.interpretationVersion,
      calculationVersion: CAPITAL_SCENARIO_CALC_VERSION,
      inputHash,
      lineage,
      fundId,
      scenarioSetId,
      baselineVariantId: saved.baselineVariantId,
      sourceConfigId: saved.sourceConfigId,
      sourceConfigVersion: saved.sourceConfigVersion,
      sourceBundleHash: saved.sourceBundleHash,
      calculatedAt: new Date().toISOString(),
      variants,
    };
    assertWithinSyncDeadline(startedAt);
    const snapshot = await persistCapitalScenarioSnapshot(
      client,
      { payload, correlationId },
      saved
    );
    if (snapshot.correlationId !== correlationId) {
      throw createHttpError(500, 'Capital snapshot belongs to a different calculation run', {
        code: 'scenario_saved_data_invalid',
      });
    }
    if (
      (await markScenarioCalculationRunCompleted(
        client,
        acquired.run.id,
        fence,
        snapshot.snapshotId
      )) !== 1
    ) {
      throw createHttpError(409, 'Capital calculation ownership was lost', {
        code: 'scenario_calculation_ownership_lost',
      });
    }
    await insertScenarioSetEvent(client, {
      scenarioSetId,
      fundId,
      eventType: 'calculated',
      actor: normalizeActor(actorInput),
      changeSummary: {
        headline: 'Calculated capital scenario set',
        calculation_mode: 'sync_capital_plan',
        override_type: 'capital_plan',
        snapshot_id: snapshot.snapshotId,
        variant_count: variants.length,
        input_hash: inputHash,
      },
    });
    const response = prepareCapitalCalculateResponse(snapshot);
    return response;
  });
}
