import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioCalculationPayloadV1Schema,
  type FundScenarioCalculationPayloadV1,
  type FundScenarioCalculationResponseV1,
  type FundScenarioResultStalenessStateV1,
  type FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { buildReservePortfolioInputForClient } from './reserve-input-builder';
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

type ReserveScenarioVariant = Extract<
  FundScenarioCalculationPayloadV1['variants'][number],
  { overrideType: 'reserve_allocation' }
>;
type ReserveScenarioPortfolio = Awaited<ReturnType<typeof buildReservePortfolioInputForClient>>;

interface SourceConfigRow {
  id: number;
  version: number;
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
}

interface ReserveScenarioCalculationData {
  portfolio: ReserveScenarioPortfolio;
  variants: ReserveScenarioVariant[];
  warningCount: number;
  payload: FundScenarioCalculationPayloadV1;
}

export interface ReserveScenarioCalculationIdentity {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  currentPublishedConfigVersion: number | null;
  inputHash: string;
  variantCount: number;
}

export function createReserveScenarioInputHash(input: {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  calcVersion: string;
  calculationMode: 'async_reserve_allocation';
  variants: Array<{
    id: string;
    override: unknown;
  }>;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        fundId: input.fundId,
        scenarioSetId: input.scenarioSetId,
        sourceConfigId: input.sourceConfigId,
        sourceConfigVersion: input.sourceConfigVersion,
        calcVersion: input.calcVersion,
        calculationMode: input.calculationMode,
        variants: input.variants
          .map((variant) => ({
            id: variant.id,
            override: variant.override,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      })
    )
    .digest('hex');
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
    `SELECT id, version
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
  const currentPublishedVersion = await loadCurrentPublishedVersion(client, fundId);
  const inputHash = createReserveScenarioInputHash({
    fundId,
    scenarioSetId,
    sourceConfigId: sourceConfig.id,
    sourceConfigVersion: sourceConfig.version,
    calcVersion: FUND_SCENARIO_CALC_VERSION,
    calculationMode: 'async_reserve_allocation',
    variants: scenarioSet.variants.map((variant) => ({
      id: variant.id,
      override: variant.override,
    })),
  });

  return { scenarioSet, sourceConfig, currentPublishedVersion, inputHash };
}

export async function getReserveScenarioCalculationIdentity(
  fundId: number,
  scenarioSetId: string
): Promise<ReserveScenarioCalculationIdentity> {
  return transaction(async (client) => {
    const { scenarioSet, sourceConfig, currentPublishedVersion, inputHash } =
      await loadReserveScenarioIdentityInTransaction(client, fundId, scenarioSetId);

    return {
      fundId,
      scenarioSetId,
      sourceConfigId: sourceConfig.id,
      sourceConfigVersion: sourceConfig.version,
      currentPublishedConfigVersion: currentPublishedVersion,
      inputHash,
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
  inputHash: string
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
      input_hash: inputHash,
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
  const reusableResponse = await findReusableReserveScenarioResponse(client, input, context);
  if (reusableResponse) {
    return reusableResponse;
  }

  await recordCalculationStartedEvent(client, input, context.inputHash);

  const data = await buildReserveScenarioCalculationData(client, input, context);
  return persistReserveScenarioCalculation(client, input, context, data);
}

async function findReusableReserveScenarioResponse(
  client: PoolClient,
  input: RunReserveScenarioCalculationInput,
  context: ReserveScenarioRunContext
): Promise<FundScenarioCalculationResponseV1 | null> {
  const reusableSnapshot = await findReusableReserveScenarioSnapshot(client, {
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
  const portfolio = await buildReservePortfolioInputForClient(client, input.fundId);
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

  return { portfolio, variants, warningCount, payload };
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

  try {
    return await transaction(async (client) => {
      const context = await loadReserveScenarioRunContext(client, input);
      inputHashForFailure = context.inputHash;
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
      error,
    });
    throw error;
  }
}
