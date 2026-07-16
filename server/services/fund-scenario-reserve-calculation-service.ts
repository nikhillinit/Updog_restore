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
import {
  acquireScenarioCalculationRun,
  findCompletedScenarioRun,
  markScenarioCalculationRunCompleted,
  markScenarioCalculationRunRunning,
} from './fund-scenario-calculation-run-service';

type ReserveScenarioVariant = Extract<
  FundScenarioCalculationPayloadV1['variants'][number],
  { overrideType: 'reserve_allocation' }
>;
type ReserveScenarioPortfolio = Awaited<
  ReturnType<typeof buildReservePortfolioInputForClientWithProvenance>
>['portfolio'];

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

async function recordCalculationFailedEvent(input: {
  fundId: number;
  scenarioSetId: string;
  actor: FundScenarioMutationActor;
  correlationId: string;
  jobId: string | null;
  inputHash: string | null;
  hashKind: ScenarioInputLineage['hashKind'] | null;
  error: unknown;
}): Promise<void> {
  try {
    await transaction(async (client) => {
      await insertScenarioSetEvent(client, {
        scenarioSetId: input.scenarioSetId,
        fundId: input.fundId,
        eventType: 'calculation_failed',
        actor: normalizeActor(input.actor),
        changeSummary: {
          headline: 'Reserve scenario calculation failed',
          calculation_mode: 'async_reserve_allocation',
          correlation_id: input.correlationId,
          job_id: input.jobId,
          input_hash: input.inputHash,
          hash_kind: input.hashKind,
          error_message: input.error instanceof Error ? input.error.message : String(input.error),
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
  context: ReserveScenarioRunContext
): Promise<void> {
  await insertScenarioSetEvent(client, {
    scenarioSetId: input.scenarioSetId,
    fundId: input.fundId,
    eventType: 'calculation_started',
    actor: normalizeActor(input.actor),
    changeSummary: {
      headline: 'Started reserve scenario calculation',
      calculation_mode: 'async_reserve_allocation',
      correlation_id: input.correlationId,
      job_id: input.jobId,
      input_hash: context.inputHash,
      hash_kind: context.inputLineage.hashKind,
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
      correlation_id: input.correlationId,
      job_id: input.jobId,
      input_hash: result.context.inputHash,
      hash_kind: result.context.inputLineage.hashKind,
      snapshot_id: result.response.snapshotId,
      variant_count: result.variantCount,
      company_count: result.companyCount,
      warning_count: result.warningCount,
      source_config_version: result.context.sourceConfig.version,
      staleness_state: result.response.payload.staleness.state,
    },
  });
}

async function calculateReserveScenarioForContext(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext
): Promise<FundScenarioCalculationResponseV1> {
  const runIdentity = {
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
  };
  const completedRun = await findCompletedScenarioRun(client, runIdentity);
  if (completedRun?.snapshotId != null) {
    const completedResponse = await findReusableReserveScenarioResponse(
      client,
      input,
      context,
      completedRun.snapshotId
    );
    if (completedResponse) {
      return completedResponse;
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
      return completedResponse;
    }
  }
  await markScenarioCalculationRunRunning(client, run.id);

  await recordCalculationStartedEvent(client, input, context);

  const data = await buildReserveScenarioCalculationData(client, input, context);
  const response = await persistReserveScenarioCalculation(client, input, context, data);
  await markScenarioCalculationRunCompleted(client, run.id, response.snapshotId);
  return response;
}

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
  const { portfolio, reserveInputTrustSummary } =
    await buildReservePortfolioInputForClientWithProvenance(client, input.fundId);
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

  return { portfolio, variants, warningCount, payload, reserveInputTrustSummary };
}

async function persistReserveScenarioCalculation(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext,
  data: ReserveScenarioCalculationData
): Promise<FundScenarioCalculationResponseV1> {
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

  await recordCalculatedReserveScenarioEvent(client, input, {
    response,
    context,
    variantCount: data.variants.length,
    companyCount: data.portfolio.length,
    warningCount: data.warningCount,
  });

  return response;
}

export async function runReserveScenarioCalculation(
  input: RunReserveScenarioCalculationInput
): Promise<FundScenarioCalculationResponseV1> {
  let inputHashForFailure: string | null = null;
  let hashKindForFailure: ScenarioInputLineage['hashKind'] | null = null;

  try {
    return await transaction(async (client) => {
      const context = await loadReserveScenarioRunContext(client, input);
      inputHashForFailure = context.inputHash;
      hashKindForFailure = context.inputLineage.hashKind;
      return calculateReserveScenarioForContext(client, input, context);
    });
  } catch (error) {
    await recordCalculationFailedEvent({
      fundId: input.fundId,
      scenarioSetId: input.scenarioSetId,
      actor: input.actor,
      correlationId: input.correlationId,
      jobId: input.jobId,
      inputHash: inputHashForFailure,
      hashKind: hashKindForFailure,
      error,
    });
    throw error;
  }
}
