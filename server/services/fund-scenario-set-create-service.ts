import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import type {
  CreateFundScenarioSetV1,
  FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  createHttpError,
  fetchScenarioSetDetail,
  insertScenarioSetEvent,
  normalizeActor,
  normalizeNullableText,
  parseCount,
  verifyFundExists,
  type FundScenarioMutationActor,
  type FundScenarioSetRow,
  type FundScenarioVariantRow,
} from './fund-scenario-set-service.js';

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
  input: CreateFundScenarioSetV1,
  actorInput: FundScenarioMutationActor = {},
  options: CreateFundScenarioSetOptions = {}
): Promise<FundScenarioSetDetailV1> {
  return transaction((client) =>
    createFundScenarioSetInTransaction(client, fundId, input, actorInput, options)
  );
}

async function createFundScenarioSetInTransaction(
  client: PoolClient,
  fundId: number,
  input: CreateFundScenarioSetV1,
  actorInput: FundScenarioMutationActor,
  options: CreateFundScenarioSetOptions
): Promise<FundScenarioSetDetailV1> {
  await verifyFundExists(client, fundId, { forUpdate: true });
  const idempotency = await resolveIdempotency(client, fundId, input, options.idempotencyKey);
  if (idempotency.replay) {
    return idempotency.replay;
  }

  const publishedConfig = await getCurrentPublishedConfig(client, fundId);
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
  input: CreateFundScenarioSetV1,
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

function createIdempotencyRequestHash(fundId: number, input: CreateFundScenarioSetV1): string {
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
  const result = await client.query<PublishedConfigRow>(
    `SELECT id, version
       FROM fundconfigs
      WHERE fund_id = $1
        AND is_published = TRUE
      ORDER BY version DESC
      LIMIT 1`,
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
    input: CreateFundScenarioSetV1;
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
       idempotency_key, idempotency_request_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
  input: CreateFundScenarioSetV1,
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
