import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioSetDetailV1Schema,
  FundScenarioSetSummaryV1Schema,
  FundScenarioVariantOverrideV1Schema,
  type ArchiveFundScenarioSetV1,
  type CreateFundScenarioSetV1,
  type FundScenarioSetDetailV1,
  type FundScenarioSetSummaryV1,
  type FundScenarioVariantV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

const MAX_ACTIVE_SCENARIO_SETS_PER_FUND = 10;

interface HttpError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
}

interface FundScenarioMutationActor {
  userId?: number | null;
  label?: string | null;
}

interface FundScenarioSetRow {
  id: string;
  fund_id: number;
  name: string;
  description: string | null;
  source_config_id: number;
  source_config_version: number;
  created_by_user_id: number | null;
  created_by_label: string | null;
  updated_by_user_id: number | null;
  updated_by_label: string | null;
  archived_at: Date | string | null;
  archived_by_user_id: number | null;
  archived_by_label: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  variant_count?: string | number;
}

interface FundScenarioVariantRow {
  id: string;
  scenario_set_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  override_type: string;
  override_payload: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PublishedConfigRow {
  id: number;
  version: number;
}

interface ActiveScenarioSetCountRow {
  active_count: string | number;
}

function createHttpError(
  statusCode: number,
  message: string,
  options: { code?: string; details?: unknown } = {}
): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (options.code) {
    error.code = options.code;
  }
  if (options.details !== undefined) {
    error.details = options.details;
  }
  return error;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIsoString(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeActor(actor: FundScenarioMutationActor = {}) {
  return {
    userId: actor.userId ?? null,
    label: normalizeNullableText(actor.label),
  };
}

function parseCount(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return parseInt(value, 10);
  }
  return 0;
}

function mapScenarioSetSummary(row: FundScenarioSetRow): FundScenarioSetSummaryV1 {
  return FundScenarioSetSummaryV1Schema.parse({
    id: row.id,
    fundId: row.fund_id,
    name: row.name,
    description: row.description,
    sourceConfigId: row.source_config_id,
    sourceConfigVersion: row.source_config_version,
    variantCount: parseCount(row.variant_count),
    archivedAt: nullableIsoString(row.archived_at),
    archivedByUserId: row.archived_by_user_id,
    archivedByLabel: row.archived_by_label,
    createdByUserId: row.created_by_user_id,
    createdByLabel: row.created_by_label,
    updatedByUserId: row.updated_by_user_id,
    updatedByLabel: row.updated_by_label,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapScenarioVariant(row: FundScenarioVariantRow): FundScenarioVariantV1 {
  const override = FundScenarioVariantOverrideV1Schema.parse({
    overrideType: row.override_type,
    payload: row.override_payload,
  });

  return {
    id: row.id,
    scenarioSetId: row.scenario_set_id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    override,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapScenarioSetDetail(
  row: FundScenarioSetRow,
  variants: FundScenarioVariantRow[]
): FundScenarioSetDetailV1 {
  return FundScenarioSetDetailV1Schema.parse({
    ...mapScenarioSetSummary({
      ...row,
      variant_count: variants.length,
    }),
    variants: variants.map(mapScenarioVariant),
  });
}

async function verifyFundExists(client: PoolClient, fundId: number): Promise<void> {
  const result = await client.query<{ id: number }>('SELECT id FROM funds WHERE id = $1', [fundId]);

  if (result.rows.length === 0) {
    throw createHttpError(404, `Fund ${fundId} not found`, { code: 'fund_not_found' });
  }
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

function scenarioSetSelectSql(lockClause = ''): string {
  return `SELECT
      s.id,
      s.fund_id,
      s.name,
      s.description,
      s.source_config_id,
      s.source_config_version,
      s.created_by_user_id,
      s.created_by_label,
      s.updated_by_user_id,
      s.updated_by_label,
      s.archived_at,
      s.archived_by_user_id,
      s.archived_by_label,
      s.created_at,
      s.updated_at,
      (SELECT COUNT(*)::int
         FROM fund_scenario_variants v
        WHERE v.scenario_set_id = s.id) AS variant_count
    FROM fund_scenario_sets s
    WHERE s.fund_id = $1
      AND s.id = $2
    ${lockClause}`;
}

async function getScenarioSetSummaryOrThrow(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  options: { forUpdate?: boolean } = {}
): Promise<FundScenarioSetRow> {
  const result = await client.query<FundScenarioSetRow>(
    scenarioSetSelectSql(options.forUpdate ? 'FOR UPDATE OF s' : ''),
    [fundId, scenarioSetId]
  );

  const scenarioSet = result.rows[0];
  if (!scenarioSet) {
    throw createHttpError(404, `Scenario set ${scenarioSetId} not found`, {
      code: 'scenario_set_not_found',
    });
  }

  return scenarioSet;
}

async function getScenarioSetVariants(
  client: PoolClient,
  scenarioSetId: string
): Promise<FundScenarioVariantRow[]> {
  const result = await client.query<FundScenarioVariantRow>(
    `SELECT
       id,
       scenario_set_id,
       name,
       description,
       sort_order,
       override_type,
       override_payload,
       created_at,
       updated_at
     FROM fund_scenario_variants
     WHERE scenario_set_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [scenarioSetId]
  );

  return result.rows;
}

async function insertScenarioSetEvent(
  client: PoolClient,
  input: {
    scenarioSetId: string;
    fundId: number;
    eventType: 'created' | 'updated' | 'archived';
    actor: ReturnType<typeof normalizeActor>;
    changeSummary: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO fund_scenario_set_events (
       scenario_set_id,
       fund_id,
       event_type,
       actor_user_id,
       actor_label,
       change_summary_json
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.scenarioSetId,
      input.fundId,
      input.eventType,
      input.actor.userId,
      input.actor.label,
      input.changeSummary,
    ]
  );
}

async function fetchScenarioSetDetail(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioSetDetailV1> {
  const summary = await getScenarioSetSummaryOrThrow(client, fundId, scenarioSetId);
  const variants = await getScenarioSetVariants(client, scenarioSetId);
  return mapScenarioSetDetail(summary, variants);
}

export async function listFundScenarioSets(
  fundId: number,
  options: { includeArchived?: boolean } = {}
): Promise<FundScenarioSetSummaryV1[]> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);

    const archivedFilter = options.includeArchived ? '' : 'AND s.archived_at IS NULL';
    const result = await client.query<FundScenarioSetRow>(
      `SELECT
         s.id,
         s.fund_id,
         s.name,
         s.description,
         s.source_config_id,
         s.source_config_version,
         s.created_by_user_id,
         s.created_by_label,
         s.updated_by_user_id,
         s.updated_by_label,
         s.archived_at,
         s.archived_by_user_id,
         s.archived_by_label,
         s.created_at,
         s.updated_at,
         COUNT(v.id)::int AS variant_count
       FROM fund_scenario_sets s
       LEFT JOIN fund_scenario_variants v ON v.scenario_set_id = s.id
       WHERE s.fund_id = $1
         ${archivedFilter}
       GROUP BY s.id
       ORDER BY s.updated_at DESC, s.id DESC`,
      [fundId]
    );

    return result.rows.map(mapScenarioSetSummary);
  });
}

export async function getFundScenarioSet(
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioSetDetailV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    return fetchScenarioSetDetail(client, fundId, scenarioSetId);
  });
}

export async function createFundScenarioSet(
  fundId: number,
  input: CreateFundScenarioSetV1,
  actorInput: FundScenarioMutationActor = {}
): Promise<FundScenarioSetDetailV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);

    const publishedConfig = await getCurrentPublishedConfig(client, fundId);
    const activeCount = await countActiveScenarioSets(client, fundId);
    if (activeCount >= MAX_ACTIVE_SCENARIO_SETS_PER_FUND) {
      throw createHttpError(
        409,
        `Fund ${fundId} already has ${MAX_ACTIVE_SCENARIO_SETS_PER_FUND} active scenario sets`,
        {
          code: 'max_scenario_sets',
          details: {
            maxActiveScenarioSets: MAX_ACTIVE_SCENARIO_SETS_PER_FUND,
          },
        }
      );
    }

    const actor = normalizeActor(actorInput);
    const setResult = await client.query<FundScenarioSetRow>(
      `INSERT INTO fund_scenario_sets (
         fund_id,
         name,
         description,
         source_config_id,
         source_config_version,
         created_by_user_id,
         created_by_label,
         updated_by_user_id,
         updated_by_label
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         fund_id,
         name,
         description,
         source_config_id,
         source_config_version,
         created_by_user_id,
         created_by_label,
         updated_by_user_id,
         updated_by_label,
         archived_at,
         archived_by_user_id,
         archived_by_label,
         created_at,
         updated_at`,
      [
        fundId,
        input.name.trim(),
        normalizeNullableText(input.description),
        publishedConfig.id,
        publishedConfig.version,
        actor.userId,
        actor.label,
        actor.userId,
        actor.label,
      ]
    );

    const scenarioSetId = setResult.rows[0]?.id;
    if (!scenarioSetId) {
      throw createHttpError(500, 'Scenario set insert did not return an id', {
        code: 'scenario_set_insert_failed',
      });
    }

    for (const [index, variant] of input.variants.entries()) {
      await client.query<FundScenarioVariantRow>(
        `INSERT INTO fund_scenario_variants (
           scenario_set_id,
           name,
           description,
           sort_order,
           override_type,
           override_payload
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING
           id,
           scenario_set_id,
           name,
           description,
           sort_order,
           override_type,
           override_payload,
           created_at,
           updated_at`,
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

    return fetchScenarioSetDetail(client, fundId, scenarioSetId);
  });
}

export async function archiveFundScenarioSet(
  fundId: number,
  scenarioSetId: string,
  actorInput: FundScenarioMutationActor = {},
  input: ArchiveFundScenarioSetV1 = {}
): Promise<FundScenarioSetSummaryV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const existing = await getScenarioSetSummaryOrThrow(client, fundId, scenarioSetId, {
      forUpdate: true,
    });

    if (existing.archived_at !== null) {
      return mapScenarioSetSummary(existing);
    }

    const actor = normalizeActor(actorInput);
    const result = await client.query<FundScenarioSetRow>(
      `UPDATE fund_scenario_sets
          SET archived_at = NOW(),
              archived_by_user_id = $1,
              archived_by_label = $2,
              updated_by_user_id = $1,
              updated_by_label = $2,
              updated_at = NOW()
        WHERE fund_id = $3
          AND id = $4
        RETURNING
          id,
          fund_id,
          name,
          description,
          source_config_id,
          source_config_version,
          created_by_user_id,
          created_by_label,
          updated_by_user_id,
          updated_by_label,
          archived_at,
          archived_by_user_id,
          archived_by_label,
          created_at,
          updated_at,
          (SELECT COUNT(*)::int
             FROM fund_scenario_variants v
            WHERE v.scenario_set_id = fund_scenario_sets.id) AS variant_count`,
      [actor.userId, actor.label, fundId, scenarioSetId]
    );

    const archived = result.rows[0];
    if (!archived) {
      throw createHttpError(404, `Scenario set ${scenarioSetId} not found`, {
        code: 'scenario_set_not_found',
      });
    }

    const reason = normalizeNullableText(input.reason);
    const changeSummary: Record<string, unknown> = {
      headline: 'Archived scenario set',
    };
    if (reason) {
      changeSummary['reason'] = reason;
    }

    await insertScenarioSetEvent(client, {
      scenarioSetId,
      fundId,
      eventType: 'archived',
      actor,
      changeSummary,
    });

    return mapScenarioSetSummary(archived);
  });
}
