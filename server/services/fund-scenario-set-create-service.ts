import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import type {
  CreateFundScenarioSetV1OrV2,
  CreateFundScenarioSetV1,
  CreateFundScenarioSetV2,
  FundScenarioSourceConfigResponseV1,
  FundScenarioSetDetailV1,
  CreateFundScenarioSetV3,
  FundScenarioCapitalCreateResponseV1,
  FundScenarioCapitalStoredOverrideV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  CreateFundScenarioSetV1Schema,
  CreateFundScenarioSetV2Schema,
  CreateFundScenarioSetV3Schema,
  FundScenarioCapitalCreateResponseV1Schema,
  FundScenarioCapitalStoredOverrideV1Schema,
  FundScenarioCapitalCalculationPayloadV1Schema,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS,
  CAPITAL_PLANNING_VERSION,
  CAPITAL_PREIMAGE_VERSION,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalIssuesV1Schema,
  type CapitalIssueV1,
} from '@shared/contracts/capital-planning-v1.contract';
import { canonicalJson } from '@shared/lib/scenarios/canonicalize';
import {
  FUND_SCENARIOS_CONTRACT_VERSION,
  resolveScenarioInputLineage,
  capitalSchemaIssues,
  expandedCapitalRows,
} from '@shared/lib/scenarios/scenario-input-envelope';
import {
  fingerprintCapitalSource,
  materializeCapitalSource,
  type CapitalRawSource,
} from '@shared/lib/capital-planning/materialize-from-fund-draft';
import { calculateCapitalPlanningV1 } from '@shared/lib/capital-planning/capital-planning-v1';
import {
  assertCalculationSize,
  CapitalPlanningCalculationError,
} from '@shared/lib/capital-planning/calculation-support';
import { createCapitalScenarioInputHash } from '../lib/scenarios/scenario-input-hash.js';
import {
  FundDraftWriteV1Schema,
  type FundDraftWriteV1,
} from '@shared/contracts/fund-draft-write-v1.contract';
import {
  createHttpError,
  fetchScenarioSetDetail,
  fetchRawScenarioSet,
  requireScenarioSetFamily,
  insertScenarioSetEvent,
  normalizeActor,
  normalizeNullableText,
  parseCount,
  verifyFundExists,
  type FundScenarioMutationActor,
  type FundScenarioSetRow,
  type FundScenarioVariantRow,
} from './fund-scenario-set-service.js';
import { normalizeLegacyScenarioSourceConfig } from './fund-scenario-source-config-compat.js';
export { capitalSchemaIssues } from '@shared/lib/scenarios/scenario-input-envelope';

const MAX_ACTIVE_SCENARIO_SETS_PER_FUND = 10;
const FUND_SCENARIO_SET_ACTIVE_NAME_UNIQUE_CONSTRAINT =
  'fund_scenario_sets_fund_name_active_unique';
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

interface CreateFundScenarioSetOptions {
  idempotencyKey?: string | null;
}

interface PublishedConfigRow {
  id: number;
  version: number;
  config: unknown;
}

interface ActiveScenarioSetCountRow {
  active_count: string | number;
}

interface PgConstraintError {
  code?: string;
  constraint?: string;
}

interface IdempotencyResolution {
  idempotencyKey: string | null;
  idempotencyRequestHash: string | null;
  replay: FundScenarioSetDetailV1 | null;
}

export async function createFundScenarioSet(
  fundId: number,
  input: CreateFundScenarioSetV1OrV2,
  actorInput: FundScenarioMutationActor = {},
  options: CreateFundScenarioSetOptions = {}
): Promise<FundScenarioSetDetailV1> {
  const parsedInput = parseCreateFundScenarioSetInput(input);
  return transaction((client) =>
    createFundScenarioSetInTransaction(client, fundId, parsedInput, actorInput, options)
  );
}

function capitalIssues(issues: CapitalIssueV1[], status = 422): never {
  throw createHttpError(status, issues[0]?.message ?? 'Capital input was refused', {
    code: issues[0]?.code ?? 'INVALID_INPUT',
    details: { issues },
  });
}

/** Aggregate saved input admission shared by create and new calculation, never replay. */
export function assertCapitalScenarioStoredInputLimits(
  overrides: readonly FundScenarioCapitalStoredOverrideV1[]
): void {
  const limits = CAPITAL_PLANNING_PROVISIONAL_LIMITS;
  assertCalculationSize(overrides, limits.maxInputBytes, 'storedVariants');
  if (overrides.length === 0 || overrides.length > limits.maxVariants) {
    throw new CapitalPlanningCalculationError([
      {
        code: overrides.length > limits.maxVariants ? 'INPUT_TOO_LARGE' : 'INVALID_INPUT',
        path: 'storedVariants',
        message: 'Capital scenarios require one to five variants',
        support: 'invalid',
        ...(overrides.length > limits.maxVariants
          ? { limit: limits.maxVariants, observed: overrides.length }
          : {}),
      },
    ]);
  }
  overrides.forEach((override, index) => {
    const parsed = FundScenarioCapitalStoredOverrideV1Schema.safeParse(override);
    if (!parsed.success)
      throw new CapitalPlanningCalculationError(
        capitalSchemaIssues(parsed.error.issues, override, `storedVariants[${index}]`)
      );
  });
  const observed = expandedCapitalRows(overrides.map((override) => override.payload.input));
  if (observed > limits.maxExpandedRows) {
    throw new CapitalPlanningCalculationError([
      {
        code: 'INPUT_TOO_LARGE',
        path: 'storedVariants',
        message: 'Capital scenarios exceed the aggregate monthly row ceiling',
        support: 'invalid',
        limit: limits.maxExpandedRows,
        observed,
      },
    ]);
  }
}

function prepareCapitalCreateResponse(scenarioSetId: string): {
  response: FundScenarioCapitalCreateResponseV1;
  serializedResponse: string;
} {
  const response = {
    contractVersion: 'fund-scenario-capital-create/1.0.0' as const,
    representation: 'capital-plan-v1' as const,
    scenarioSetId,
  };
  if (!FundScenarioCapitalCreateResponseV1Schema.safeParse(response).success) {
    throw createHttpError(500, 'Capital create response failed validation', {
      code: 'scenario_response_invalid',
    });
  }
  return { response, serializedResponse: JSON.stringify(response) };
}

/** V3 has a separate admission path; legacy V1/V2 parsing and request hashes stay unchanged. */
export async function createFundScenarioCapitalSet(
  fundId: number,
  input: CreateFundScenarioSetV3,
  actorInput: FundScenarioMutationActor = {},
  options: CreateFundScenarioSetOptions = {}
): Promise<{ response: FundScenarioCapitalCreateResponseV1; serializedResponse: string }> {
  const parsed = CreateFundScenarioSetV3Schema.safeParse(input);
  if (!parsed.success) {
    const issues = capitalSchemaIssues(parsed.error.issues, input);
    capitalIssues(issues);
  }
  const request = parsed.data;
  try {
    assertCalculationSize(request, CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxInputBytes, 'input');
    return await transaction(async (client) => {
      await verifyFundExists(client, fundId, { forUpdate: true });
      const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
      const requestHash = crypto
        .createHash('sha256')
        .update(canonicalJson({ fundId, input: request }))
        .digest('hex');
      if (idempotencyKey !== null) {
        const existing = await getScenarioSetByIdempotencyKey(client, fundId, idempotencyKey);
        if (existing) {
          assertIdempotencyRequestMatches(existing, idempotencyKey, requestHash);
          requireScenarioSetFamily(
            await fetchRawScenarioSet(client, fundId, existing.id),
            'capital_plan'
          );
          return prepareCapitalCreateResponse(existing.id);
        }
      }
      if (request.expectedInterpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION) {
        capitalIssues([
          {
            code: 'INTERPRETATION_VERSION_UNSUPPORTED',
            path: 'expectedInterpretationVersion',
            message: 'Reviewed interpretation version is unsupported',
            support: 'unsupported',
          },
        ]);
      }
      const source = await getCurrentCapitalPublishedSource(client, fundId);
      const fingerprint = fingerprintCapitalSource(source);
      if (
        request.expectedSourceConfigId !== source.config.id ||
        request.expectedSourceConfigVersion !== source.config.version ||
        request.expectedSourceBundleHash !== fingerprint.sourceBundleHash
      ) {
        throw createHttpError(409, 'Scenario source config changed since it was loaded', {
          code: 'scenario_source_config_stale',
          details: {
            suppliedSourceConfigId: request.expectedSourceConfigId,
            suppliedSourceConfigVersion: request.expectedSourceConfigVersion,
            suppliedSourceBundleHash: request.expectedSourceBundleHash,
            currentSourceConfigId: source.config.id,
            currentSourceConfigVersion: source.config.version,
            currentSourceBundleHash: fingerprint.sourceBundleHash,
          },
        });
      }
      const materialized = materializeCapitalSource({
        source,
        inputs: request.variants.map((variant) => variant.override.payload),
        unitDeclarations: request.unitDeclarations,
        expectedInterpretationVersion: request.expectedInterpretationVersion,
      });
      if (!materialized.ok) capitalIssues(materialized.issues, materialized.status);
      const overrides = request.variants.map(
        (variant, index): FundScenarioCapitalStoredOverrideV1 => {
          const supplied = variant.override.payload;
          const normalizedInput =
            materialized.resolvedInputs?.[index] ??
            ('input' in supplied ? supplied.input : supplied);
          const snapshots = materialized.benchmarkSnapshotsByInput?.[index];
          return FundScenarioCapitalStoredOverrideV1Schema.parse({
            overrideType: 'capital_plan',
            payload: {
              input: normalizedInput,
              sourceBundle: materialized.sourceBundle,
              sourceBundleHash: materialized.sourceBundle.sourceBundleHash,
              ...(snapshots === undefined ? {} : { benchmarkSnapshots: snapshots }),
            },
          });
        }
      );
      assertCapitalScenarioStoredInputLimits(overrides);
      const scenarioSetId = crypto.randomUUID();
      const lineage = resolveScenarioInputLineage(
        materialized.sourceBundle.modelInputsAsOfDate ?? undefined
      );
      const envelope = {
        contractVersion: FUND_SCENARIOS_CONTRACT_VERSION,
        fundId,
        scenarioSetId,
        sourceConfigId: source.config.id,
        sourceConfigVersion: source.config.version,
        calculationDomain: 'capital_plan' as const,
        calculationMode: 'sync_capital_plan' as const,
        overrideType: 'capital_plan' as const,
        capitalPreimageVersion: CAPITAL_PREIMAGE_VERSION,
        methodVersion: CAPITAL_PLANNING_VERSION,
        interpretationVersion: materialized.sourceBundle.interpretationVersion,
        engineVersion: '1.0.0',
        baselineVariantId: request.baselineVariantId,
        sourceBundleHash: materialized.sourceBundle.sourceBundleHash,
        variants: request.variants.map((variant, index) => ({
          variantId: variant.variantId,
          sortOrder: index,
          override: overrides[index]!,
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
      const payload = FundScenarioCapitalCalculationPayloadV1Schema.parse({
        contractVersion: 'fund-scenario-capital-calculation/1.0.0',
        calculationDomain: 'capital_plan',
        calculationMode: 'sync_capital_plan',
        capitalPreimageVersion: CAPITAL_PREIMAGE_VERSION,
        methodVersion: CAPITAL_PLANNING_VERSION,
        interpretationVersion: materialized.sourceBundle.interpretationVersion,
        calculationVersion: '1.0.0',
        inputHash,
        lineage,
        fundId,
        scenarioSetId,
        baselineVariantId: request.baselineVariantId,
        sourceConfigId: source.config.id,
        sourceConfigVersion: source.config.version,
        sourceBundleHash: materialized.sourceBundle.sourceBundleHash,
        calculatedAt: new Date().toISOString(),
        variants: request.variants.map((variant, index) => ({
          variantId: variant.variantId,
          scenarioSetId,
          name: variant.name,
          overrideType: 'capital_plan',
          result: calculateCapitalPlanningV1({
            input: overrides[index]!.payload.input,
            sourceBundle: materialized.sourceBundle,
            ...(overrides[index]!.payload.benchmarkSnapshots === undefined
              ? {}
              : {
                  benchmarkSnapshots: overrides[index]!.payload.benchmarkSnapshots,
                }),
          }),
        })),
      });
      assertCalculationSize(
        payload,
        CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxSnapshotBytes,
        'snapshot'
      );
      await assertActiveScenarioSetCapacity(client, fundId);
      const collisions = await client.query<{ id: string }>(
        'SELECT id FROM fund_scenario_variants WHERE id = ANY($1::uuid[])',
        [request.variants.map((variant) => variant.variantId)]
      );
      if (collisions.rows.length > 0) {
        throw createHttpError(409, 'A scenario variant identity is already in use', {
          code: 'scenario_variant_id_conflict',
        });
      }
      const actor = normalizeActor(actorInput);
      const persistedId = await insertScenarioSet(client, {
        fundId,
        scenarioSetId,
        input: request,
        actor,
        publishedConfig: {
          id: source.config.id,
          version: source.config.version,
          config: source.config.raw,
        },
        idempotencyKey,
        idempotencyRequestHash: idempotencyKey === null ? null : requestHash,
      });
      for (const [index, variant] of request.variants.entries()) {
        await client.query(
          `INSERT INTO fund_scenario_variants
           (id, scenario_set_id, name, description, sort_order, override_type, override_payload)
           VALUES ($1, $2, $3, $4, $5, 'capital_plan', $6)`,
          [
            variant.variantId,
            persistedId,
            variant.name,
            normalizeNullableText(variant.description),
            index,
            JSON.stringify(overrides[index]!.payload),
          ]
        );
      }
      await recordScenarioSetCreated(client, fundId, persistedId, actor, request, {
        id: source.config.id,
        version: source.config.version,
        config: source.config.raw,
      });
      return prepareCapitalCreateResponse(persistedId);
    });
  } catch (error) {
    if (error instanceof CapitalPlanningCalculationError) capitalIssues(error.issues);
    const issues = CapitalIssuesV1Schema.safeParse(
      error instanceof Error && 'issues' in error ? error.issues : undefined
    );
    if (issues.success && issues.data.length > 0) capitalIssues(issues.data);
    if (isUniqueConstraintViolation(error, 'fund_scenario_variants_pkey')) {
      throw createHttpError(409, 'A scenario variant identity is already in use', {
        code: 'scenario_variant_id_conflict',
      });
    }
    throw error;
  }
}

async function getCurrentCapitalPublishedSource(
  client: PoolClient,
  fundId: number
): Promise<CapitalRawSource> {
  // The fund row is already locked by the caller; lock the publication row before CAS.
  const config = await client.query<PublishedConfigRow & { published_at: Date | string }>(
    `SELECT id, version, config, published_at FROM fundconfigs
     WHERE fund_id = $1 AND is_published = TRUE
     ORDER BY version DESC, id DESC LIMIT 1 FOR UPDATE`,
    [fundId]
  );
  const row = config.rows[0];
  if (!row)
    throw createHttpError(409, `Fund ${fundId} does not have a published config`, {
      code: 'no_published_config',
    });
  const fund = await client.query<{
    id: number;
    size: string | number;
    base_currency: string | null;
  }>('SELECT id, size, base_currency FROM funds WHERE id = $1', [fundId]);
  const fundRow = fund.rows[0];
  if (!fundRow)
    throw createHttpError(404, `Fund ${fundId} was not found`, { code: 'fund_not_found' });
  return {
    fund: { id: fundRow.id, size: fundRow.size, baseCurrency: fundRow.base_currency },
    config: {
      id: row.id,
      version: row.version,
      raw: row.config,
      publishedAt:
        row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
    },
  };
}

type CreateFundScenarioSetInput = CreateFundScenarioSetV1 | CreateFundScenarioSetV2;

function parseCreateFundScenarioSetInput(input: unknown): CreateFundScenarioSetInput {
  const parsedV1 = CreateFundScenarioSetV1Schema.safeParse(input);
  if (parsedV1.success) {
    return parsedV1.data;
  }

  const parsedV2 = CreateFundScenarioSetV2Schema.safeParse(input);
  if (parsedV2.success) {
    return parsedV2.data;
  }

  const isV2Payload =
    input !== null &&
    typeof input === 'object' &&
    (input as Record<string, unknown>)['contractVersion'] === 'fund-scenario-set-create/2.0.0';
  const validationError = isV2Payload ? parsedV2.error : parsedV1.error;

  throw createHttpError(isV2Payload ? 422 : 400, 'Invalid fund scenario set payload', {
    code: isV2Payload ? 'invalid_scenario_set_v2_payload' : 'invalid_scenario_set_payload',
    details: {
      issues: validationError.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    },
  });
}

async function createFundScenarioSetInTransaction(
  client: PoolClient,
  fundId: number,
  input: CreateFundScenarioSetInput,
  actorInput: FundScenarioMutationActor,
  options: CreateFundScenarioSetOptions
): Promise<FundScenarioSetDetailV1> {
  await verifyFundExists(client, fundId, { forUpdate: true });
  const idempotency = await resolveIdempotency(client, fundId, input, options.idempotencyKey);
  if (idempotency.replay) {
    return idempotency.replay;
  }

  const publishedConfig = await getCurrentPublishedConfig(client, fundId);
  if (isCreateFundScenarioSetV2(input)) {
    assertExpectedSourceConfig(input, publishedConfig);
    assertSourcePinnedScenarioVariants(input, parsePublishedConfig(fundId, publishedConfig));
  }

  await assertActiveScenarioSetCapacity(client, fundId);
  const actor = normalizeActor(actorInput);
  const scenarioSetId = await insertScenarioSet(client, {
    fundId,
    input,
    actor,
    publishedConfig,
    idempotencyKey: idempotency.idempotencyKey,
    idempotencyRequestHash: idempotency.idempotencyRequestHash,
  });

  await insertScenarioVariants(client, scenarioSetId, input.variants);
  await recordScenarioSetCreated(client, fundId, scenarioSetId, actor, input, publishedConfig);
  return fetchScenarioSetDetail(client, fundId, scenarioSetId);
}

async function resolveIdempotency(
  client: PoolClient,
  fundId: number,
  input: CreateFundScenarioSetInput,
  idempotencyKeyInput: string | null | undefined
): Promise<IdempotencyResolution> {
  const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyInput);
  if (idempotencyKey === null) {
    return { idempotencyKey: null, idempotencyRequestHash: null, replay: null };
  }

  const idempotencyRequestHash = createIdempotencyRequestHash(fundId, input);
  const existing = await getScenarioSetByIdempotencyKey(client, fundId, idempotencyKey);
  if (!existing) {
    return { idempotencyKey, idempotencyRequestHash, replay: null };
  }

  assertIdempotencyRequestMatches(existing, idempotencyKey, idempotencyRequestHash);
  return {
    idempotencyKey,
    idempotencyRequestHash,
    replay: await fetchScenarioSetDetail(client, fundId, existing.id),
  };
}

function normalizeIdempotencyKey(value: string | null | undefined): string | null {
  const trimmed = normalizeNullableText(value);
  if (trimmed !== null && trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw createHttpError(400, 'Idempotency key must be 128 characters or fewer', {
      code: 'invalid_idempotency_key',
      details: { maxLength: MAX_IDEMPOTENCY_KEY_LENGTH },
    });
  }

  return trimmed;
}

function createIdempotencyRequestHash(fundId: number, input: CreateFundScenarioSetInput): string {
  return crypto.createHash('sha256').update(JSON.stringify({ fundId, input })).digest('hex');
}

function assertIdempotencyRequestMatches(
  scenarioSet: FundScenarioSetRow,
  idempotencyKey: string,
  requestHash: string
): void {
  if (scenarioSet.idempotency_request_hash === requestHash) {
    return;
  }

  throw createHttpError(422, 'Idempotency key was used with a different request payload', {
    code: 'idempotency_key_reused',
    details: { idempotencyKey },
  });
}

async function getCurrentPublishedConfig(
  client: PoolClient,
  fundId: number
): Promise<PublishedConfigRow> {
  // FOR UPDATE is required: the publish path flips is_published on the
  // current row without taking the funds-row lock, so an unlocked read could
  // validate a pin against config A while a concurrent publish commits
  // config B — the new set would be born stale. Locking the selected row
  // serializes create against publish in both orders (a publish that
  // commits first makes our read see B and fail the pin with 409).
  const result = await client.query<PublishedConfigRow>(
    `SELECT id, version, config
       FROM fundconfigs
      WHERE fund_id = $1
        AND is_published = TRUE
      ORDER BY version DESC
      LIMIT 1
      FOR UPDATE`,
    [fundId]
  );

  const publishedConfig = result.rows[0];
  if (!publishedConfig) {
    throw createHttpError(409, `Fund ${fundId} does not have a published config`, {
      code: 'no_published_config',
    });
  }

  return publishedConfig;
}

function isCreateFundScenarioSetV2(
  input: CreateFundScenarioSetInput
): input is CreateFundScenarioSetV2 {
  return 'contractVersion' in input;
}

function parsePublishedConfig(
  fundId: number,
  publishedConfig: PublishedConfigRow
): FundDraftWriteV1 {
  const parsed = FundDraftWriteV1Schema.safeParse(
    normalizeLegacyScenarioSourceConfig(publishedConfig.config)
  );
  if (parsed.success) {
    return parsed.data;
  }

  throw createHttpError(409, `Scenario source config for fund ${fundId} is invalid`, {
    code: 'scenario_source_config_invalid',
    details: {
      sourceConfigId: publishedConfig.id,
      sourceConfigVersion: publishedConfig.version,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    },
  });
}

function assertExpectedSourceConfig(
  input: CreateFundScenarioSetV2,
  publishedConfig: PublishedConfigRow
): void {
  if (
    input.expectedSourceConfigId === publishedConfig.id &&
    input.expectedSourceConfigVersion === publishedConfig.version
  ) {
    return;
  }

  throw createHttpError(409, 'Scenario source config changed since it was loaded', {
    code: 'scenario_source_config_stale',
    details: {
      suppliedSourceConfigId: input.expectedSourceConfigId,
      suppliedSourceConfigVersion: input.expectedSourceConfigVersion,
      currentSourceConfigId: publishedConfig.id,
      currentSourceConfigVersion: publishedConfig.version,
    },
  });
}

type SourceConfigArrayKind = 'allocation' | 'capital-plan-allocation';

type SourceConfigArrays =
  | Pick<FundDraftWriteV1, 'allocations' | 'capitalPlanAllocations'>
  | Pick<FundScenarioSourceConfigResponseV1, 'allocations' | 'capitalPlanAllocations'>;

interface RowIdentityDriftDetails {
  arrayKind?: SourceConfigArrayKind;
  variantIndex?: number;
  rowIndex?: number;
  rowIdentity?: {
    arrayKind: SourceConfigArrayKind;
    id: string;
  };
  field?: string;
  reason: string;
  expected?: unknown;
  actual?: unknown;
}

function throwSourcePinnedRowIdentityDrift(details: RowIdentityDriftDetails): never {
  throw createHttpError(422, 'Scenario variant rows do not match the pinned source config', {
    code: 'scenario_variant_row_identity_drift',
    details,
  });
}

export function assertSourcePinnedScenarioVariants(
  input: CreateFundScenarioSetV2,
  sourceConfig: SourceConfigArrays
): void {
  if (input.variants.length !== 3) {
    throwSourcePinnedRowIdentityDrift({
      reason: 'variant_count',
      expected: 3,
      actual: input.variants.length,
    });
  }

  const allocationPayloads = input.variants.map((variant, variantIndex) => {
    if (variant.override.overrideType !== 'allocation') {
      throwSourcePinnedRowIdentityDrift({
        variantIndex,
        reason: 'allocation_override_required',
        actual: variant.override.overrideType,
      });
    }

    return variant.override.payload;
  });

  assertSourcePinnedArray(
    'allocation',
    sourceConfig.allocations ?? undefined,
    allocationPayloads.map((payload) => payload.allocations),
    ['id']
  );
  assertSourcePinnedArray(
    'capital-plan-allocation',
    sourceConfig.capitalPlanAllocations ?? undefined,
    allocationPayloads.map((payload) => payload.capitalPlanAllocations),
    ['id', 'sectorProfileId', 'entryRound', 'initialCheckStrategy', 'followOnStrategy']
  );
}

function assertSourcePinnedArray<T extends { id: string }>(
  arrayKind: SourceConfigArrayKind,
  pinnedRows: T[] | undefined,
  variantRows: Array<T[] | undefined>,
  frozenFields: ReadonlyArray<keyof T>
): void {
  const pinnedIsPresent = pinnedRows !== undefined;

  for (const [variantIndex, candidateRows] of variantRows.entries()) {
    if ((candidateRows !== undefined) !== pinnedIsPresent) {
      throwSourcePinnedRowIdentityDrift({
        arrayKind,
        variantIndex,
        reason: 'array_presence',
        expected: pinnedIsPresent,
        actual: candidateRows !== undefined,
      });
    }

    if (candidateRows === undefined || pinnedRows === undefined) {
      continue;
    }

    if (candidateRows.length !== pinnedRows.length) {
      throwSourcePinnedRowIdentityDrift({
        arrayKind,
        variantIndex,
        reason: 'array_length',
        expected: pinnedRows.length,
        actual: candidateRows.length,
      });
    }

    for (const [rowIndex, pinnedRow] of pinnedRows.entries()) {
      const candidateRow = candidateRows[rowIndex];
      if (!candidateRow || candidateRow.id !== pinnedRow.id) {
        throwSourcePinnedRowIdentityDrift({
          arrayKind,
          variantIndex,
          rowIndex,
          rowIdentity: { arrayKind, id: pinnedRow.id },
          reason: 'row_id_sequence',
          expected: pinnedRow.id,
          actual: candidateRow?.id,
        });
      }

      if (variantIndex === 0) {
        continue;
      }

      for (const field of frozenFields) {
        if (!isDeepStrictEqual(candidateRow[field], pinnedRow[field])) {
          throwSourcePinnedRowIdentityDrift({
            arrayKind,
            variantIndex,
            rowIndex,
            rowIdentity: { arrayKind, id: pinnedRow.id },
            field: String(field),
            reason: 'frozen_field',
            expected: pinnedRow[field],
            actual: candidateRow[field],
          });
        }
      }
    }

    if (variantIndex === 0 && !isDeepStrictEqual(candidateRows, pinnedRows)) {
      throwSourcePinnedRowIdentityDrift({
        arrayKind,
        variantIndex,
        reason: 'base_array_mismatch',
        expected: pinnedRows,
        actual: candidateRows,
      });
    }
  }
}

async function assertActiveScenarioSetCapacity(client: PoolClient, fundId: number): Promise<void> {
  const activeCount = await countActiveScenarioSets(client, fundId);
  if (activeCount < MAX_ACTIVE_SCENARIO_SETS_PER_FUND) {
    return;
  }

  throw createHttpError(
    409,
    `Fund ${fundId} already has ${MAX_ACTIVE_SCENARIO_SETS_PER_FUND} active scenario sets`,
    {
      code: 'max_scenario_sets',
      details: { maxActiveScenarioSets: MAX_ACTIVE_SCENARIO_SETS_PER_FUND },
    }
  );
}

async function countActiveScenarioSets(client: PoolClient, fundId: number): Promise<number> {
  const result = await client.query<ActiveScenarioSetCountRow>(
    `SELECT COUNT(*)::int AS active_count
       FROM fund_scenario_sets
      WHERE fund_id = $1
        AND archived_at IS NULL`,
    [fundId]
  );

  return parseCount(result.rows[0]?.active_count);
}

async function getScenarioSetByIdempotencyKey(
  client: PoolClient,
  fundId: number,
  idempotencyKey: string
): Promise<FundScenarioSetRow | null> {
  const result = await client.query<FundScenarioSetRow>(
    `SELECT
       s.id, s.fund_id, s.name, s.description, s.source_config_id,
       s.source_config_version, s.created_by_user_id, s.created_by_label,
       s.updated_by_user_id, s.updated_by_label, s.archived_at,
       s.archived_by_user_id, s.archived_by_label, s.idempotency_key,
       s.idempotency_request_hash, s.created_at, s.updated_at,
       (SELECT COUNT(*)::int
          FROM fund_scenario_variants v
         WHERE v.scenario_set_id = s.id) AS variant_count
     FROM fund_scenario_sets s
     WHERE s.fund_id = $1
       AND s.idempotency_key = $2
     LIMIT 1`,
    [fundId, idempotencyKey]
  );

  return result.rows[0] ?? null;
}

async function insertScenarioSet(
  client: PoolClient,
  input: {
    fundId: number;
    input: Pick<CreateFundScenarioSetV1, 'name' | 'description'>;
    scenarioSetId?: string;
    actor: ReturnType<typeof normalizeActor>;
    publishedConfig: PublishedConfigRow;
    idempotencyKey: string | null;
    idempotencyRequestHash: string | null;
  }
): Promise<string> {
  const scenarioSetName = input.input.name.trim();
  try {
    return await insertScenarioSetRow(client, input, scenarioSetName);
  } catch (error) {
    if (isUniqueConstraintViolation(error, FUND_SCENARIO_SET_ACTIVE_NAME_UNIQUE_CONSTRAINT)) {
      throw createHttpError(409, `Scenario set "${scenarioSetName}" already exists`, {
        code: 'duplicate_scenario_set_name',
        details: { name: scenarioSetName },
      });
    }

    throw error;
  }
}

async function insertScenarioSetRow(
  client: PoolClient,
  input: Parameters<typeof insertScenarioSet>[1],
  scenarioSetName: string
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO fund_scenario_sets (
       fund_id, name, description, source_config_id, source_config_version,
       created_by_user_id, created_by_label, updated_by_user_id, updated_by_label,
       idempotency_key, idempotency_request_hash${input.scenarioSetId === undefined ? '' : ', id'}
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11${input.scenarioSetId === undefined ? '' : ', $12'})
     RETURNING id`,
    [
      input.fundId,
      scenarioSetName,
      normalizeNullableText(input.input.description),
      input.publishedConfig.id,
      input.publishedConfig.version,
      input.actor.userId,
      input.actor.label,
      input.actor.userId,
      input.actor.label,
      input.idempotencyKey,
      input.idempotencyRequestHash,
      ...(input.scenarioSetId === undefined ? [] : [input.scenarioSetId]),
    ]
  );

  const scenarioSetId = result.rows[0]?.id;
  if (!scenarioSetId) {
    throw createHttpError(500, 'Scenario set insert did not return an id', {
      code: 'scenario_set_insert_failed',
    });
  }
  return scenarioSetId;
}

async function insertScenarioVariants(
  client: PoolClient,
  scenarioSetId: string,
  variants: CreateFundScenarioSetV1['variants']
): Promise<void> {
  for (const [index, variant] of variants.entries()) {
    await client.query<FundScenarioVariantRow>(
      `INSERT INTO fund_scenario_variants (
         scenario_set_id, name, description, sort_order, override_type, override_payload
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id, scenario_set_id, name, description, sort_order, override_type,
         override_payload, created_at, updated_at`,
      [
        scenarioSetId,
        variant.name.trim(),
        normalizeNullableText(variant.description),
        index,
        variant.override.overrideType,
        variant.override.payload,
      ]
    );
  }
}

async function recordScenarioSetCreated(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  actor: ReturnType<typeof normalizeActor>,
  input: { variants: readonly unknown[] },
  publishedConfig: PublishedConfigRow
): Promise<void> {
  await insertScenarioSetEvent(client, {
    scenarioSetId,
    fundId,
    eventType: 'created',
    actor,
    changeSummary: {
      headline: `Created scenario set with ${input.variants.length} variant${
        input.variants.length === 1 ? '' : 's'
      }`,
      variant_count: input.variants.length,
      source_config_version: publishedConfig.version,
    },
  });
}

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const candidate = error as PgConstraintError;
  return candidate.code === '23505' && candidate.constraint === constraintName;
}
