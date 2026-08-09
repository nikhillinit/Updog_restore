import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioCalculationPayloadV1Schema,
  type FundScenarioCalculationPayloadV1,
  type FundScenarioCalculationResponseV1,
  type FundScenarioResultStalenessStateV1,
  type FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  FUND_SCENARIOS_CONTRACT_VERSION,
  resolveScenarioInputLineage,
  type ScenarioInputLineage,
} from '@shared/lib/scenarios/scenario-input-envelope';
import {
  FundDraftWriteV1Schema,
  type FundDraftWriteV1,
} from '@shared/contracts/fund-draft-write-v1.contract';
import { buildReservePortfolioInputForClientWithProvenance } from './reserve-input-builder';
import type { ReserveInputTrustSummary } from '../../shared/contracts/reserve-input-provenance.contract';
import { buildScenarioReserveSummary } from './fund-scenario-reserve-summary';
import {
  FUND_SCENARIO_CALC_VERSION,
  applyScenarioReadStaleness,
  findReusableReserveScenarioSnapshot,
  persistReserveScenarioSnapshot,
} from './fund-scenario-reserve-snapshot-store';
import {
  createHttpError,
  fetchScenarioSetDetail,
  insertScenarioSetEvent,
  normalizeActor,
  verifyFundExists,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';
import { createScenarioInputHash } from '../lib/scenarios/scenario-input-hash';
import { normalizeLegacyScenarioSourceConfig } from './fund-scenario-source-config-compat.js';
import { logger } from '../lib/logger';
import {
  acquireScenarioCalculationRun,
  claimScenarioCalculationRunIfQueued,
  completeScenarioCalculationRunIfRunning,
  failScenarioCalculationRunIfRunning,
  findCompletedScenarioRun,
  markScenarioCalculationRunTimedOut,
  type ScenarioCalculationRunRecord,
  type ScenarioCalculationRunFenceIdentity,
} from './fund-scenario-calculation-run-service';
import {
  FundScenarioHardTimeoutError,
  isFundScenarioHardTimeoutError,
} from './fund-scenario-timeout';


type ReserveScenarioVariant = Extract<
  FundScenarioCalculationPayloadV1['variants'][number],
  { overrideType: 'reserve_allocation' }
>;
type ReserveScenarioPortfolio = Awaited<
  ReturnType<typeof buildReservePortfolioInputForClientWithProvenance>
>['portfolio'];

export interface ScenarioCalculationOwnershipLost {
  readonly kind: 'ownership_lost';
}

const PRIVATE_OWNERSHIP_LOST = Object.freeze({
  kind: 'ownership_lost',
}) as ScenarioCalculationOwnershipLost;

export function isScenarioCalculationOwnershipLost(
  value: unknown
): value is ScenarioCalculationOwnershipLost {
  return value === PRIVATE_OWNERSHIP_LOST;
}

interface SourceConfigRow {
  id: number;
  version: number;
  config: unknown;
}

interface CurrentPublishedConfigRow {
  version: number;
}

interface FundSizeRow {
  size: string | number;
}

interface RunReserveScenarioCalculationInput {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  actor: FundScenarioMutationActor;
  jobId: string | null;
  runId?: string;
  signal?: AbortSignal;
  abortController?: AbortController;
}

interface ReserveScenarioRunContext {
  scenarioSet: FundScenarioSetDetailV1;
  sourceConfig: SourceConfigRow;
  currentPublishedVersion: number | null;
  inputHash: string;
  inputLineage: ScenarioInputLineage;
}

interface ReserveScenarioCalculationData {
  portfolio: ReserveScenarioPortfolio;
  variants: ReserveScenarioVariant[];
  warningCount: number;
  payload: FundScenarioCalculationPayloadV1;
  reserveInputTrustSummary: ReserveInputTrustSummary;
}

interface ClaimedReserveScenarioRun {
  context: ReserveScenarioRunContext;
  identity: ScenarioCalculationRunFenceIdentity;
  run: ScenarioCalculationRunRecord;
}

type ReserveScenarioClaimOutcome =
  | { kind: 'reusable'; response: FundScenarioCalculationResponseV1 }
  | { kind: 'claimed'; value: ClaimedReserveScenarioRun }
  | null;

class ScenarioRunOwnershipLostError extends Error {
  constructor() {
    super('Scenario calculation run ownership was lost');
    this.name = 'ScenarioRunOwnershipLostError';
  }
}

class ScenarioRunIdentityDriftError extends Error {
  constructor() {
    super('Scenario calculation run identity changed while calculating');
    this.name = 'ScenarioRunIdentityDriftError';
  }
}

export interface ReserveScenarioCalculationIdentity {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  currentPublishedConfigVersion: number | null;
  inputHash: string;
  inputLineage: ScenarioInputLineage;
  variantCount: number;
}

export function createReserveScenarioInputHash(input: {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  modelInputsAsOfDate?: string;
  calcVersion: string;
  calculationMode: 'async_reserve_allocation';
  variants: Array<{
    id: string;
    sortOrder: number;
    override: unknown;
  }>;
}): string {
  const lineage = resolveScenarioInputLineage(input.modelInputsAsOfDate);
  const hashEnvelopeBase = {
    contractVersion: FUND_SCENARIOS_CONTRACT_VERSION,
    scenarioSetId: input.scenarioSetId,
    sourceConfigId: input.sourceConfigId,
    sourceConfigVersion: input.sourceConfigVersion,
    calculationMode: input.calculationMode,
    overrideType: 'reserve_allocation' as const,
    engineVersion: input.calcVersion,
    variants: input.variants.map((variant) => ({
      variantId: variant.id,
      sortOrder: variant.sortOrder,
      override: variant.override,
    })),
  };

  return lineage.hashKind === 'scenario-input-hash-v2'
    ? createScenarioInputHash({
        ...hashEnvelopeBase,
        version: lineage.hashKind,
        modelInputsAsOfDate: lineage.modelInputsAsOfDate,
      })
    : createScenarioInputHash({
        ...hashEnvelopeBase,
        version: lineage.hashKind,
      });
}

function assertReserveScenarioSet(scenarioSet: FundScenarioSetDetailV1): void {
  if (
    scenarioSet.variants.every((variant) => variant.override.overrideType === 'reserve_allocation')
  ) {
    return;
  }

  throw createHttpError(409, 'Use calculate for fee-profile scenario sets', {
    code: 'scenario_calculation_mode_mismatch',
  });
}

async function loadSourceConfig(
  client: PoolClient,
  fundId: number,
  configId: number,
  configVersion: number
): Promise<SourceConfigRow> {
  const result = await client.query<SourceConfigRow>(
    `SELECT id, version, config
       FROM fundconfigs
      WHERE fund_id = $1
        AND id = $2
        AND version = $3
      LIMIT 1`,
    [fundId, configId, configVersion]
  );

  const sourceConfig = result.rows[0];
  if (!sourceConfig) {
    throw createHttpError(409, `Scenario source config ${configId} could not be loaded`, {
      code: 'scenario_source_config_missing',
      details: { sourceConfigId: configId, sourceConfigVersion: configVersion },
    });
  }

  return sourceConfig;
}

function parseSourceConfig(fundId: number, sourceConfig: SourceConfigRow): FundDraftWriteV1 {
  const parsed = FundDraftWriteV1Schema.safeParse(
    normalizeLegacyScenarioSourceConfig(sourceConfig.config)
  );
  if (parsed.success) {
    return parsed.data;
  }

  throw createHttpError(409, `Scenario source config for fund ${fundId} is invalid`, {
    code: 'scenario_source_config_invalid',
    details: {
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    },
  });
}

async function loadCurrentPublishedVersion(
  client: PoolClient,
  fundId: number
): Promise<number | null> {
  const result = await client.query<CurrentPublishedConfigRow>(
    `SELECT version
       FROM fundconfigs
      WHERE fund_id = $1
        AND is_published = TRUE
      ORDER BY version DESC
      LIMIT 1`,
    [fundId]
  );

  return result.rows[0]?.version ?? null;
}

async function loadFundSizeCents(client: PoolClient, fundId: number): Promise<number | null> {
  const result = await client.query<FundSizeRow>('SELECT size FROM funds WHERE id = $1 LIMIT 1', [
    fundId,
  ]);
  const size = result.rows[0]?.size;
  if (size == null) {
    return null;
  }
  const parsed = typeof size === 'number' ? size : Number.parseFloat(size);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

async function loadReserveScenarioIdentityInTransaction(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  options: { forUpdate?: boolean } = {}
): Promise<{
  scenarioSet: FundScenarioSetDetailV1;
  sourceConfig: SourceConfigRow;
  currentPublishedVersion: number | null;
  inputHash: string;
  inputLineage: ScenarioInputLineage;
}> {
  await verifyFundExists(client, fundId);
  const scenarioSetOptions =
    options.forUpdate === undefined ? undefined : { forUpdate: options.forUpdate };
  const scenarioSet = await fetchScenarioSetDetail(
    client,
    fundId,
    scenarioSetId,
    scenarioSetOptions
  );
  assertReserveScenarioSet(scenarioSet);

  if (scenarioSet.archivedAt !== null) {
    throw createHttpError(409, `Scenario set ${scenarioSetId} is archived`, {
      code: 'scenario_set_archived',
    });
  }

  const sourceConfig = await loadSourceConfig(
    client,
    fundId,
    scenarioSet.sourceConfigId,
    scenarioSet.sourceConfigVersion
  );
  const sourceConfigBody = parseSourceConfig(fundId, sourceConfig);
  const inputLineage = resolveScenarioInputLineage(sourceConfigBody.modelInputsAsOfDate);
  const currentPublishedVersion = await loadCurrentPublishedVersion(client, fundId);
  const inputHash = createReserveScenarioInputHash({
    fundId,
    scenarioSetId,
    sourceConfigId: sourceConfig.id,
    sourceConfigVersion: sourceConfig.version,
    ...(sourceConfigBody.modelInputsAsOfDate !== undefined && {
      modelInputsAsOfDate: sourceConfigBody.modelInputsAsOfDate,
    }),
    calcVersion: FUND_SCENARIO_CALC_VERSION,
    calculationMode: 'async_reserve_allocation',
    variants: scenarioSet.variants.map((variant) => ({
      id: variant.id,
      sortOrder: variant.sortOrder,
      override: variant.override,
    })),
  });

  return { scenarioSet, sourceConfig, currentPublishedVersion, inputHash, inputLineage };
}

export async function getReserveScenarioCalculationIdentity(
  fundId: number,
  scenarioSetId: string
): Promise<ReserveScenarioCalculationIdentity> {
  return transaction(async (client) => {
    const { scenarioSet, sourceConfig, currentPublishedVersion, inputHash, inputLineage } =
      await loadReserveScenarioIdentityInTransaction(client, fundId, scenarioSetId);

    return {
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      currentPublishedConfigVersion: currentPublishedVersion,
      inputHash,
      inputLineage,
      variantCount: scenarioSet.variants.length,
    };
  });
}

async function lockScenarioSetForFailure(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string
): Promise<void> {
  await client.query(
    `SELECT id
       FROM fund_scenario_sets
      WHERE fund_id = $1
        AND id = $2
      FOR UPDATE`,
    [fundId, scenarioSetId]
  );
}

function failureMetadata(error: unknown): { code: string | null; message: string } {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  return {
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

async function recordCalculationFailedEvent(input: {
  claimed: ClaimedReserveScenarioRun;
  calculationInput: RunReserveScenarioCalculationInput;
  error: unknown;
}): Promise<void> {
  const failure = failureMetadata(input.error);

  try {
    await transaction(async (client) => {
      // Keep failure persistence in scenario -> run lock order. A duplicate
      // delivery can otherwise deadlock while it is claiming the same run.
      await lockScenarioSetForFailure(
        client,
        input.calculationInput.fundId,
        input.calculationInput.scenarioSetId
      );

      const failedRun = await failScenarioCalculationRunIfRunning(
        client,
        input.claimed.run.id,
        input.claimed.identity,
        failure
      );
      if (!failedRun) {
        return;
      }

      await insertScenarioSetEvent(client, {
        scenarioSetId: input.calculationInput.scenarioSetId,
        fundId: input.calculationInput.fundId,
        eventType: 'calculation_failed',
        actor: normalizeActor(input.calculationInput.actor),
        changeSummary: {
          headline: 'Reserve scenario calculation failed',
          calculation_mode: 'async_reserve_allocation',
          run_id: input.claimed.run.id,
          correlation_id: input.calculationInput.correlationId,
          job_id: input.calculationInput.jobId,
          input_hash: input.claimed.identity.inputHash,
          hash_kind: input.claimed.identity.hashKind,
          model_inputs_as_of_date: input.claimed.identity.modelInputsAsOfDate,
          comparison_lineage_version: input.claimed.identity.comparisonLineageVersion,
          failure_code: failure.code,
          error_message: failure.message,
        },
      });
    });
  } catch {
    // Preserve the original calculation failure.
  }
}

async function loadReserveScenarioRunContext(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput
): Promise<ReserveScenarioRunContext> {
  return loadReserveScenarioIdentityInTransaction(client, input.fundId, input.scenarioSetId, {
    forUpdate: true,
  });
}

async function recordCalculationStartedEvent(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext,
  runId: string
): Promise<void> {
  await insertScenarioSetEvent(client, {
    scenarioSetId: input.scenarioSetId,
    fundId: input.fundId,
    eventType: 'calculation_started',
    actor: normalizeActor(input.actor),
    changeSummary: {
      headline: 'Started reserve scenario calculation',
      calculation_mode: 'async_reserve_allocation',
      run_id: runId,
      correlation_id: input.correlationId,
      job_id: input.jobId,
      input_hash: context.inputHash,
      hash_kind: context.inputLineage.hashKind,
      model_inputs_as_of_date: context.inputLineage.modelInputsAsOfDate,
      comparison_lineage_version: context.inputLineage.comparisonLineageVersion,
    },
  });
}

function reserveScenarioStaleness(
  sourceConfigVersion: number,
  currentPublishedVersion: number | null
): FundScenarioResultStalenessStateV1 {
  return currentPublishedVersion != null && currentPublishedVersion > sourceConfigVersion
    ? 'STALE_PUBLISH'
    : 'CURRENT';
}

function buildReserveScenarioVariants(input: {
  fundId: number;
  fundSizeCents: number | null;
  portfolio: ReserveScenarioPortfolio;
  scenarioSet: FundScenarioSetDetailV1;
}): ReserveScenarioVariant[] {
  return input.scenarioSet.variants.map((variant) => {
    if (variant.override.overrideType !== 'reserve_allocation') {
      throw createHttpError(409, 'Use calculate for fee-profile scenario sets', {
        code: 'scenario_calculation_mode_mismatch',
      });
    }

    return {
      variantId: variant.id,
      scenarioSetId: variant.scenarioSetId,
      name: variant.name,
      overrideType: variant.override.overrideType,
      reserve: buildScenarioReserveSummary({
        fundId: input.fundId,
        fundSizeCents: input.fundSizeCents,
        portfolio: input.portfolio,
        override: variant.override,
      }),
    };
  });
}

function buildReserveScenarioPayload(input: {
  fundId: number;
  scenarioSetId: string;
  sourceConfig: SourceConfigRow;
  currentPublishedVersion: number | null;
  variants: ReserveScenarioVariant[];
}): FundScenarioCalculationPayloadV1 {
  const stalenessState = reserveScenarioStaleness(
    input.sourceConfig.version,
    input.currentPublishedVersion
  );

  return FundScenarioCalculationPayloadV1Schema.parse({
    version: 'fund-scenarios-v1',
    calculationMode: 'async_reserve_allocation',
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    sourceConfigId: input.sourceConfig.id,
    sourceConfigVersion: input.sourceConfig.version,
    staleness: {
      state: stalenessState,
      sourceConfigVersion: input.sourceConfig.version,
      currentPublishedConfigVersion: input.currentPublishedVersion,
    },
    calculatedAt: new Date().toISOString(),
    variants: input.variants,
  });
}

async function recordCalculatedReserveScenarioEvent(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  runId: string,
  result: {
    response: FundScenarioCalculationResponseV1;
    context: ReserveScenarioRunContext;
    variantCount: number;
    companyCount: number;
    warningCount: number;
  }
): Promise<void> {
  await insertScenarioSetEvent(client, {
    scenarioSetId: input.scenarioSetId,
    fundId: input.fundId,
    eventType: 'calculated',
    actor: normalizeActor(input.actor),
    changeSummary: {
      headline: 'Calculated reserve scenario set',
      calculation_mode: 'async_reserve_allocation',
      run_id: runId,
      correlation_id: input.correlationId,
      job_id: input.jobId,
      input_hash: result.context.inputHash,
      hash_kind: result.context.inputLineage.hashKind,
      model_inputs_as_of_date: result.context.inputLineage.modelInputsAsOfDate,
      comparison_lineage_version: result.context.inputLineage.comparisonLineageVersion,
      snapshot_id: result.response.snapshotId,
      variant_count: result.variantCount,
      company_count: result.companyCount,
      warning_count: result.warningCount,
      source_config_version: result.context.sourceConfig.version,
      staleness_state: result.response.payload.staleness.state,
    },
  });
}

function runIdentityFromContext(
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext
): ScenarioCalculationRunFenceIdentity {
  return {
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    sourceConfigId: context.sourceConfig.id,
    sourceConfigVersion: context.sourceConfig.version,
    calculationMode: 'async_reserve_allocation' as const,
    overrideType: 'reserve_allocation' as const,
    inputHash: context.inputHash,
    hashKind: context.inputLineage.hashKind,
    modelInputsAsOfDate: context.inputLineage.modelInputsAsOfDate,
    comparisonLineageVersion: context.inputLineage.comparisonLineageVersion,
    jobId: input.jobId,
  };
}

function sameRunIdentity(
  left: ScenarioCalculationRunFenceIdentity,
  right: ScenarioCalculationRunFenceIdentity
): boolean {
  return (
    left.fundId === right.fundId &&
    left.scenarioSetId === right.scenarioSetId &&
    left.sourceConfigId === right.sourceConfigId &&
    left.sourceConfigVersion === right.sourceConfigVersion &&
    left.calculationMode === right.calculationMode &&
    left.overrideType === right.overrideType &&
    left.inputHash === right.inputHash &&
    (left.hashKind ?? 'scenario-input-hash-v1') ===
      (right.hashKind ?? 'scenario-input-hash-v1') &&
    left.modelInputsAsOfDate === right.modelInputsAsOfDate &&
    left.comparisonLineageVersion === right.comparisonLineageVersion &&
    left.jobId === right.jobId
  );
}

function normalizeRunIdentityHashKind(
  identity: ScenarioCalculationRunFenceIdentity
): ScenarioCalculationRunFenceIdentity & {
  hashKind: NonNullable<ScenarioCalculationRunFenceIdentity['hashKind']>;
} {
  return {
    ...identity,
    hashKind: identity.hashKind ?? 'scenario-input-hash-v1',
  };
}

async function claimReserveScenarioRun(
  input: RunReserveScenarioCalculationInput
): Promise<ReserveScenarioClaimOutcome> {
  return transaction(async (client) => {
    const context = await loadReserveScenarioRunContext(client, input);
    const runIdentity = normalizeRunIdentityHashKind(runIdentityFromContext(input, context));

    if (input.runId !== undefined) {
      const claimedRun = await claimScenarioCalculationRunIfQueued(client, input.runId, runIdentity);
      if (!claimedRun) {
        logger.info(
          { runId: input.runId, jobId: runIdentity.jobId },
          'Ignoring stale fund scenario calculation delivery'
        );
        return null;
      }

      await recordCalculationStartedEvent(client, input, context, claimedRun.id);
      return {
        kind: 'claimed',
        value: { context, identity: runIdentity, run: claimedRun },
      };
    }

    const completedRun = await findCompletedScenarioRun(client, runIdentity);
    if (completedRun?.snapshotId != null) {
      const completedResponse = await findReusableReserveScenarioResponse(
        client,
        input,
        context,
        completedRun.snapshotId
      );
      if (completedResponse) {
        return { kind: 'reusable', response: completedResponse };
      }
    }

    const run = await acquireScenarioCalculationRun(client, {
      ...runIdentity,
      correlationId: input.correlationId,
      jobId: input.jobId,
    });
    if (run.status === 'completed' && run.snapshotId !== null) {
      const completedResponse = await findReusableReserveScenarioResponse(
        client,
        input,
        context,
        run.snapshotId
      );
      if (completedResponse) {
        return { kind: 'reusable', response: completedResponse };
      }
    }

    const claimedRun = await claimScenarioCalculationRunIfQueued(client, run.id, runIdentity);
    if (!claimedRun) {
      if (runIdentity.jobId !== null) {
        await markScenarioCalculationRunTimedOut(client, run.id, runIdentity.jobId);
      }
      return null;
    }

    await recordCalculationStartedEvent(client, input, context, claimedRun.id);
    return {
      kind: 'claimed',
      value: { context, identity: runIdentity, run: claimedRun },
    };
  });
}

interface ScenarioDeadlineActor {
  stop(): void;
}

function startScenarioDeadlineActor(
  input: RunReserveScenarioCalculationInput,
  claimed: ClaimedReserveScenarioRun
): ScenarioDeadlineActor {
  const deadlineAt = claimed.run.deadlineAt;
  if (input.abortController === undefined || deadlineAt === null || deadlineAt === undefined) {
    return { stop: () => {} };
  }

  const deadlineMs = deadlineAt instanceof Date ? deadlineAt.getTime() : Date.parse(deadlineAt);
  const timer = setTimeout(
    () => {
      void transaction(async (client) => {
        const affectedRows = await markScenarioCalculationRunTimedOut(
          client,
          claimed.run.id,
          claimed.identity.jobId
        );
        if (affectedRows === 1) {
          input.abortController?.abort(new FundScenarioHardTimeoutError(claimed.run.id));
        }
      }).catch(() => {
        // The handler retains the original calculation error when the deadline actor cannot persist.
      });
    },
    Math.max(0, deadlineMs - Date.now())
  );

  return { stop: () => clearTimeout(timer) };
}

async function completeReserveScenarioRun(
  input: RunReserveScenarioCalculationInput,
  claimed: ClaimedReserveScenarioRun
): Promise<FundScenarioCalculationResponseV1> {
  return transaction(async (client) => {
    // Completion uses the same scenario -> run lock order as failure
    // persistence. The locked context is the current identity fence.
    const currentContext = await loadReserveScenarioRunContext(client, input);
    const currentIdentity = runIdentityFromContext(input, currentContext);
    if (!sameRunIdentity(claimed.identity, currentIdentity)) {
      throw new ScenarioRunIdentityDriftError();
    }

    const data = await buildReserveScenarioCalculationData(client, input, claimed.context);
    const response = await persistReserveScenarioCalculation(
      client,
      input,
      claimed.context,
      data
    );
    const completedRun = await completeScenarioCalculationRunIfRunning(
      client,
      claimed.run.id,
      claimed.identity,
      response.snapshotId
    );
    if (!completedRun) {
      throw new ScenarioRunOwnershipLostError();
    }

    await recordCalculatedReserveScenarioEvent(client, input, claimed.run.id, {
      response,
      context: claimed.context,
      variantCount: data.variants.length,
      companyCount: data.portfolio.length,
      warningCount: data.warningCount,
    });
    return response;
  });
}

async function calculateReserveScenarioForContext(
  input: RunReserveScenarioCalculationInput,
  claimed: ClaimedReserveScenarioRun
): Promise<FundScenarioCalculationResponseV1> {
  return completeReserveScenarioRun(input, claimed);
}

/*
 * Kept as a small lookup helper so completed responses continue to use the
 * same snapshot identity checks as the pre-existing synchronous path.
 */
async function findReusableReserveScenarioResponse(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext,
  snapshotId: number
): Promise<FundScenarioCalculationResponseV1 | null> {
  const reusableSnapshot = await findReusableReserveScenarioSnapshot(client, {
    snapshotId,
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    sourceConfigId: context.sourceConfig.id,
    sourceConfigVersion: context.sourceConfig.version,
    inputHash: context.inputHash,
  });

  return reusableSnapshot
    ? applyScenarioReadStaleness(reusableSnapshot, context.currentPublishedVersion)
    : null;
}

async function buildReserveScenarioCalculationData(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext
): Promise<ReserveScenarioCalculationData> {
  input.signal?.throwIfAborted();
  const { portfolio, reserveInputTrustSummary } =
    await buildReservePortfolioInputForClientWithProvenance(client, input.fundId);
  input.signal?.throwIfAborted();
  const fundSizeCents = await loadFundSizeCents(client, input.fundId);
  const variants = buildReserveScenarioVariants({
    fundId: input.fundId,
    fundSizeCents,
    portfolio,
    scenarioSet: context.scenarioSet,
  });
  const warningCount = variants.reduce((sum, variant) => sum + variant.reserve.warnings.length, 0);
  const payload = buildReserveScenarioPayload({
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    sourceConfig: context.sourceConfig,
    currentPublishedVersion: context.currentPublishedVersion,
    variants,
  });

  input.signal?.throwIfAborted();

  return { portfolio, variants, warningCount, payload, reserveInputTrustSummary };
}

async function persistReserveScenarioCalculation(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext,
  data: ReserveScenarioCalculationData
): Promise<FundScenarioCalculationResponseV1> {
  input.signal?.throwIfAborted();
  const response = await persistReserveScenarioSnapshot(client, {
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    sourceConfigId: context.sourceConfig.id,
    sourceConfigVersion: context.sourceConfig.version,
    correlationId: input.correlationId,
    payload: data.payload,
    inputHash: context.inputHash,
    variantCount: data.variants.length,
    companyCount: data.portfolio.length,
    warningCount: data.warningCount,
    reserveInputTrustSummary: data.reserveInputTrustSummary,
  });

  input.signal?.throwIfAborted();

  return response;
}

export async function runReserveScenarioCalculation(
  input: RunReserveScenarioCalculationInput
): Promise<FundScenarioCalculationResponseV1 | ScenarioCalculationOwnershipLost> {
  input.signal?.throwIfAborted();

  let claimed: ClaimedReserveScenarioRun | undefined;
  try {
    const outcome = await claimReserveScenarioRun(input);
    if (outcome === null) {
      return PRIVATE_OWNERSHIP_LOST;
    }
    if (outcome.kind === 'reusable') {
      return outcome.response;
    }

    claimed = outcome.value;
    const deadlineActor = startScenarioDeadlineActor(input, claimed);
    try {
      input.signal?.throwIfAborted();
      return await calculateReserveScenarioForContext(input, claimed);
    } finally {
      deadlineActor.stop();
    }
  } catch (error) {
    if (error instanceof ScenarioRunOwnershipLostError) {
      return PRIVATE_OWNERSHIP_LOST;
    }
    if (claimed && !isFundScenarioHardTimeoutError(error)) {
      await recordCalculationFailedEvent({ claimed, calculationInput: input, error });
    }
    throw error;
  }
}
