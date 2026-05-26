import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioSetDetailV1Schema,
  FundScenarioSetSummaryV1Schema,
  FundScenarioVariantOverrideV1Schema,
  type ArchiveFundScenarioSetV1,
  type FundScenarioSetDetailV1,
  type FundScenarioSetSummaryV1,
  type FundScenarioVariantV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export interface HttpError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
}

export interface FundScenarioMutationActor {
  userId?: number | null;
  label?: string | null;
}

export interface FundScenarioSetRow {
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
  idempotency_key?: string | null;
  idempotency_request_hash?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  variant_count?: string | number;
}

export interface FundScenarioVariantRow {
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

export function createHttpError(
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

export function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeActor(actor: FundScenarioMutationActor = {}) {
  return {
    userId: actor.userId ?? null,
    label: normalizeNullableText(actor.label),
  };
}

export function parseCount(value: string | number | undefined): number {
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

export async function verifyFundExists(
  client: PoolClient,
  fundId: number,
  options: { forUpdate?: boolean } = {}
): Promise<void> {
  const lockClause = options.forUpdate ? ' FOR UPDATE' : '';
  const result = await client.query<{ id: number }>(
    `SELECT id FROM funds WHERE id = $1${lockClause}`,
    [fundId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, `Fund ${fundId} not found`, { code: 'fund_not_found' });
  }
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
      s.idempotency_key,
      s.idempotency_request_hash,
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

export async function insertScenarioSetEvent(
  client: PoolClient,
  input: {
    scenarioSetId: string;
    fundId: number;
    eventType: 'created' | 'updated' | 'archived' | 'calculated';
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

export async function fetchScenarioSetDetail(
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
         s.idempotency_key,
         s.idempotency_request_hash,
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

export async function archiveFundScenarioSet(
  fundId: number,
  scenarioSetId: string,
  actorInput: FundScenarioMutationActor = {},
  input: ArchiveFundScenarioSetV1 = {}
): Promise<FundScenarioSetSummaryV1> {
  return transaction((client) =>
    archiveFundScenarioSetInTransaction(client, fundId, scenarioSetId, actorInput, input)
  );
}

async function archiveFundScenarioSetInTransaction(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  actorInput: FundScenarioMutationActor,
  input: ArchiveFundScenarioSetV1
): Promise<FundScenarioSetSummaryV1> {
  await verifyFundExists(client, fundId);
  const existing = await getScenarioSetSummaryOrThrow(client, fundId, scenarioSetId, {
    forUpdate: true,
  });

  if (existing.archived_at !== null) {
    return mapScenarioSetSummary(existing);
  }

  const actor = normalizeActor(actorInput);
  const archived = await updateArchivedScenarioSet(client, fundId, scenarioSetId, actor);
  await insertScenarioSetEvent(client, {
    scenarioSetId,
    fundId,
    eventType: 'archived',
    actor,
    changeSummary: buildArchiveChangeSummary(input.reason),
  });

  return mapScenarioSetSummary(archived);
}

async function updateArchivedScenarioSet(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  actor: ReturnType<typeof normalizeActor>
): Promise<FundScenarioSetRow> {
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
        id, fund_id, name, description, source_config_id, source_config_version,
        created_by_user_id, created_by_label, updated_by_user_id, updated_by_label,
        archived_at, archived_by_user_id, archived_by_label, idempotency_key,
        idempotency_request_hash, created_at, updated_at,
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
  return archived;
}

function buildArchiveChangeSummary(
  reasonInput: string | null | undefined
): Record<string, unknown> {
  const reason = normalizeNullableText(reasonInput);
  return reason
    ? { headline: 'Archived scenario set', reason }
    : { headline: 'Archived scenario set' };
}
