import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  CAPITAL_PLAN_REPRESENTATION,
  FundScenarioCapitalArchiveResponseV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
  FundScenarioCapitalListResponseV1Schema,
  FundScenarioCapitalSourceResponseV1Schema,
  FundScenarioCapitalStoredOverrideV1Schema,
  FundScenarioSourceConfigResponseV1Schema,
  FundScenarioSetDetailV1Schema,
  FundScenarioSetSummaryV1Schema,
  FundScenarioVariantOverrideV1Schema,
  type ArchiveFundScenarioSetV1,
  type FundScenarioSetDetailV1,
  type FundScenarioSetSummaryV1,
  type FundScenarioSourceConfigResponseV1,
  type FundScenarioVariantV1,
  type FundScenarioCapitalDetailResponseV1,
  type FundScenarioCapitalListResponseV1,
  type FundScenarioCapitalSourceResponseV1,
  type FundScenarioCapitalStoredOverrideV1,
  type FundScenarioCapitalSetSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalIssuesV1Schema,
  CapitalReadStateV1Schema,
  type CapitalReadStateV1,
} from '@shared/contracts/capital-planning-v1.contract';
import { canonicalJson, sha256CanonicalJson } from '@shared/lib/canonical-json';
import {
  fingerprintCapitalSource,
  inspectCapitalSourcePreview,
  type CapitalRawSource,
} from '@shared/lib/capital-planning/materialize-from-fund-draft';
import { normalizeLegacyScenarioSourceConfig } from './fund-scenario-source-config-compat.js';

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

export type FundScenarioFamily = 'legacy' | 'capital_plan';

export interface RawFundScenarioSet {
  row: FundScenarioSetRow;
  variants: FundScenarioVariantRow[];
  family: FundScenarioFamily;
}

const LEGACY_SCENARIO_TYPES = new Set([
  'fee_profile',
  'allocation',
  'sector_profile',
  'methodology',
  'reserve_allocation',
]);

export function classifyScenarioSetFamily(
  variants: readonly FundScenarioVariantRow[]
): FundScenarioFamily {
  const capital = variants.some((variant) => variant.override_type === 'capital_plan');
  const legacy = variants.some((variant) => LEGACY_SCENARIO_TYPES.has(variant.override_type));
  if (
    variants.length === 0 ||
    (capital && legacy) ||
    variants.some(
      (variant) =>
        variant.override_type !== 'capital_plan' &&
        !LEGACY_SCENARIO_TYPES.has(variant.override_type)
    )
  ) {
    throw createHttpError(500, 'Stored scenario set has an invalid or mixed family', {
      code: 'scenario_set_family_invalid',
    });
  }
  return capital ? 'capital_plan' : 'legacy';
}

export function requireScenarioSetFamily(
  raw: RawFundScenarioSet,
  expectedFamily: FundScenarioFamily
): void {
  if (classifyScenarioSetFamily(raw.variants) !== raw.family) {
    throw createHttpError(500, 'Stored scenario family classification is inconsistent', {
      code: 'scenario_set_family_invalid',
    });
  }
  if (raw.family === expectedFamily) return;
  if (raw.family === 'capital_plan') {
    throw createHttpError(406, 'This scenario set requires representation=capital-plan-v1', {
      code: 'scenario_representation_required',
      details: { representation: CAPITAL_PLAN_REPRESENTATION },
    });
  }
  throw createHttpError(
    406,
    'The capital-plan-v1 representation does not apply to this scenario set',
    {
      code: 'scenario_representation_not_applicable',
    }
  );
}

interface PublishedScenarioSourceConfigRow {
  id: number;
  version: number;
  published_at: Date | string;
  config: unknown;
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

export async function getFundScenarioSourceConfig(
  fundId: number
): Promise<FundScenarioSourceConfigResponseV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);

    const result = await client.query<PublishedScenarioSourceConfigRow>(
      `SELECT id, version, published_at, config
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

    const parsedConfig = FundDraftWriteV1Schema.safeParse(
      normalizeLegacyScenarioSourceConfig(publishedConfig.config)
    );
    if (!parsedConfig.success) {
      throw createHttpError(409, `Scenario source config for fund ${fundId} is invalid`, {
        code: 'scenario_source_config_invalid',
        details: {
          sourceConfigId: publishedConfig.id,
          sourceConfigVersion: publishedConfig.version,
          issues: parsedConfig.error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          })),
        },
      });
    }

    return FundScenarioSourceConfigResponseV1Schema.parse({
      contractVersion: 'fund-scenario-source-config/1.0.0',
      sourceConfigId: publishedConfig.id,
      sourceConfigVersion: publishedConfig.version,
      publishedAt: toIsoString(publishedConfig.published_at),
      allocations: parsedConfig.data.allocations ?? null,
      capitalPlanAllocations: parsedConfig.data.capitalPlanAllocations ?? null,
    });
  });
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
    throw createHttpError(404, 'Scenario set not found', {
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
    eventType:
      | 'created'
      | 'updated'
      | 'archived'
      | 'calculated'
      | 'calculation_queued'
      | 'calculation_started'
      | 'calculation_failed';
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

export async function fetchRawScenarioSet(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  options: { forUpdate?: boolean } = {}
): Promise<RawFundScenarioSet> {
  const summary = await getScenarioSetSummaryOrThrow(client, fundId, scenarioSetId, options);
  const variants = await getScenarioSetVariants(client, scenarioSetId);
  return { row: summary, variants, family: classifyScenarioSetFamily(variants) };
}

export async function fetchScenarioSetDetail(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  options: { forUpdate?: boolean } = {}
): Promise<FundScenarioSetDetailV1> {
  const raw = await fetchRawScenarioSet(client, fundId, scenarioSetId, options);
  requireScenarioSetFamily(raw, 'legacy');
  return mapScenarioSetDetail(raw.row, raw.variants);
}

export async function fetchRawScenarioSets(
  client: PoolClient,
  fundId: number,
  options: { includeArchived?: boolean } = {}
): Promise<RawFundScenarioSet[]> {
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

  if (result.rows.length === 0) return [];
  const variants = await client.query<FundScenarioVariantRow>(
    `SELECT id, scenario_set_id, name, description, sort_order,
              override_type, override_payload, created_at, updated_at
         FROM fund_scenario_variants
        WHERE scenario_set_id = ANY($1::uuid[])
        ORDER BY scenario_set_id ASC, sort_order ASC, id ASC`,
    [result.rows.map((row) => row.id)]
  );
  const bySet = new Map<string, FundScenarioVariantRow[]>(result.rows.map((row) => [row.id, []]));
  for (const variant of variants.rows) {
    const group = bySet.get(variant.scenario_set_id);
    if (!group) {
      throw createHttpError(500, 'Stored scenario variant has an unexpected parent', {
        code: 'scenario_set_family_invalid',
      });
    }
    group.push(variant);
  }
  return result.rows.map((row) => {
    const setVariants = bySet.get(row.id)!;
    return { row, variants: setVariants, family: classifyScenarioSetFamily(setVariants) };
  });
}

export async function listFundScenarioSets(
  fundId: number,
  options: { includeArchived?: boolean } = {}
): Promise<FundScenarioSetSummaryV1[]> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const sets = await fetchRawScenarioSets(client, fundId, options);
    return sets
      .filter((set) => set.family === 'legacy')
      .map((set) => mapScenarioSetSummary({ ...set.row, variant_count: set.variants.length }));
  });
}

export async function loadCurrentCapitalRawSource(
  client: PoolClient,
  fundId: number
): Promise<CapitalRawSource | null> {
  const result = await client.query<{
    fund_id: number;
    size: string | number;
    base_currency: string | null;
    id: number;
    version: number;
    config: unknown;
    published_at: Date | string;
  }>(
    `SELECT f.id AS fund_id, f.size, f.base_currency,
            c.id, c.version, c.config, c.published_at
       FROM funds f
       JOIN LATERAL (
         SELECT id, version, config, published_at
           FROM fundconfigs
          WHERE fund_id = f.id AND is_published = TRUE
          ORDER BY version DESC, id DESC
          LIMIT 1
       ) c ON TRUE
      WHERE f.id = $1`,
    [fundId]
  );
  const row = result.rows[0];
  if (!row) return null;
  // These tables have no persisted unit/schema tag columns. Omission preserves
  // their actual absence in the fingerprint; raw config is never hydrated here.
  return {
    fund: { id: row.fund_id, size: row.size, baseCurrency: row.base_currency },
    config: {
      id: row.id,
      version: row.version,
      raw: row.config,
      publishedAt: toIsoString(row.published_at),
    },
  };
}

export function buildCapitalReadState(
  savedOverrides: readonly FundScenarioCapitalStoredOverrideV1[],
  currentSource: CapitalRawSource | null
): CapitalReadStateV1 {
  const first = savedOverrides[0];
  if (!first) {
    throw createHttpError(500, 'Stored capital scenario has no variants', {
      code: 'scenario_saved_data_invalid',
    });
  }
  let firstBundleJson: string | undefined;
  for (const override of savedOverrides) {
    if (!FundScenarioCapitalStoredOverrideV1Schema.safeParse(override).success) {
      throw createHttpError(500, 'Stored capital scenario input is invalid', {
        code: 'scenario_saved_data_invalid',
      });
    }
    const bundle = override.payload.sourceBundle;
    if (
      sha256CanonicalJson(bundle.projection) !== bundle.sourceBundleHash ||
      canonicalJson(bundle) !== (firstBundleJson ??= canonicalJson(first.payload.sourceBundle))
    ) {
      throw createHttpError(500, 'Stored capital source identity is inconsistent', {
        code: 'scenario_saved_data_invalid',
      });
    }
  }
  const bundle = first.payload.sourceBundle;
  const savedVersion = bundle.interpretationVersion;
  const supported = savedVersion === CAPITAL_SOURCE_INTERPRETATION_VERSION;
  let sourceFreshness: CapitalReadStateV1['sourceFreshness'] = 'STALE_SOURCE_UNAVAILABLE';
  if (currentSource) {
    if (
      currentSource.fund.id !== bundle.projection.fundId ||
      currentSource.config.id !== bundle.projection.sourceConfigId ||
      currentSource.config.version !== bundle.projection.sourceConfigVersion
    ) {
      sourceFreshness = 'STALE_PUBLISH';
    } else {
      try {
        sourceFreshness =
          fingerprintCapitalSource(currentSource).sourceBundleHash === bundle.sourceBundleHash
            ? 'CURRENT'
            : 'STALE_SOURCE';
      } catch {
        sourceFreshness = 'STALE_SOURCE_UNAVAILABLE';
      }
    }
  }
  return CapitalReadStateV1Schema.parse({
    sourceFreshness,
    calculationReadiness: {
      context: 'saved_input',
      state: supported ? 'READY' : 'UNSUPPORTED',
      issues: supported
        ? []
        : [
            {
              code: 'INTERPRETATION_VERSION_UNSUPPORTED',
              path: 'sourceBundle.interpretationVersion',
              message: 'The saved interpretation is unavailable for new calculations',
              support: 'unsupported',
            },
          ],
    },
    interpretationCompatibility: {
      state: supported ? 'CURRENT' : 'UNSUPPORTED_SAVED_VERSION',
      savedVersion,
      currentVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    },
  });
}

export async function fetchCapitalScenarioSetDetailFromRaw(
  client: PoolClient,
  raw: RawFundScenarioSet,
  options: { readCurrentSource?: boolean } = {}
): Promise<FundScenarioCapitalDetailResponseV1> {
  requireScenarioSetFamily(raw, 'capital_plan');
  const variants = raw.variants.map((variant) => ({
    id: variant.id,
    scenarioSetId: variant.scenario_set_id,
    name: variant.name,
    description: variant.description,
    sortOrder: variant.sort_order,
    override: { overrideType: 'capital_plan' as const, payload: variant.override_payload },
    createdAt: toIsoString(variant.created_at),
    updatedAt: toIsoString(variant.updated_at),
  }));
  const overrides = variants.map((variant) => {
    const parsed = FundScenarioCapitalStoredOverrideV1Schema.safeParse(variant.override);
    if (!parsed.success) {
      throw createHttpError(500, 'Stored capital scenario input is invalid', {
        code: 'scenario_saved_data_invalid',
      });
    }
    // Validation must not default, trim, or rebuild historical saved fields.
    return variant.override as FundScenarioCapitalStoredOverrideV1;
  });
  const first = overrides[0]!;
  const readState = buildCapitalReadState(
    overrides,
    // Commands use only saved identity before replay. Their acknowledgements omit readState.
    options.readCurrentSource === false
      ? null
      : await loadCurrentCapitalRawSource(client, raw.row.fund_id)
  );
  const detail = {
    ...mapScenarioSetSummary({ ...raw.row, variant_count: variants.length }),
    contractVersion: 'fund-scenario-capital-detail/1.0.0' as const,
    representation: CAPITAL_PLAN_REPRESENTATION,
    overrideType: 'capital_plan' as const,
    baselineVariantId: variants[0]!.id,
    sourceBundleHash: first.payload.sourceBundleHash,
    interpretationVersion: first.payload.sourceBundle.interpretationVersion,
    readState,
    variants,
  };
  if (!FundScenarioCapitalDetailResponseV1Schema.safeParse(detail).success) {
    throw createHttpError(500, 'Stored capital scenario detail is inconsistent', {
      code: 'scenario_saved_data_invalid',
    });
  }
  return detail as FundScenarioCapitalDetailResponseV1;
}

export async function getFundScenarioCapitalSourceConfig(
  fundId: number
): Promise<FundScenarioCapitalSourceResponseV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const source = await loadCurrentCapitalRawSource(client, fundId);
    if (!source) {
      throw createHttpError(409, `Fund ${fundId} does not have a published config`, {
        code: 'no_published_config',
      });
    }
    let inspection: ReturnType<typeof inspectCapitalSourcePreview>;
    try {
      inspection = inspectCapitalSourcePreview(source);
    } catch (error) {
      const parsedIssues = CapitalIssuesV1Schema.safeParse(
        error instanceof Error && 'issues' in error ? error.issues : undefined
      );
      const issues =
        parsedIssues.success && parsedIssues.data.length > 0
          ? parsedIssues.data
          : [
              {
                code: 'INVALID_INPUT' as const,
                path: 'source',
                message: 'Published capital source cannot be fingerprinted',
                support: 'invalid' as const,
              },
            ];
      throw createHttpError(422, issues[0]!.message, {
        code: issues[0]!.code,
        details: { issues },
      });
    }
    return FundScenarioCapitalSourceResponseV1Schema.parse({
      contractVersion: 'fund-scenario-capital-source/1.0.0',
      representation: CAPITAL_PLAN_REPRESENTATION,
      ...inspection,
      publishedAt: source.config.publishedAt,
      interpretationVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
      interpretationCompatibility: {
        state: 'CURRENT',
        savedVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
        currentVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
      },
    });
  });
}

export async function listFundScenarioCapitalSets(
  fundId: number,
  options: { includeArchived?: boolean } = {}
): Promise<FundScenarioCapitalListResponseV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const rawSets = await fetchRawScenarioSets(client, fundId, options);
    const scenarioSets = [];
    for (const raw of rawSets.filter((set) => set.family === 'capital_plan')) {
      const {
        contractVersion: _version,
        representation: _representation,
        variants: _variants,
        ...summary
      } = await fetchCapitalScenarioSetDetailFromRaw(client, raw);
      scenarioSets.push(summary);
    }
    return FundScenarioCapitalListResponseV1Schema.parse({
      contractVersion: 'fund-scenario-capital-list/1.0.0',
      representation: CAPITAL_PLAN_REPRESENTATION,
      scenarioSets,
    });
  });
}

export async function getFundScenarioCapitalSet(
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioCapitalDetailResponseV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    return fetchCapitalScenarioSetDetailFromRaw(
      client,
      await fetchRawScenarioSet(client, fundId, scenarioSetId)
    );
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

export async function archiveFundScenarioCapitalSet(
  fundId: number,
  scenarioSetId: string,
  actorInput: FundScenarioMutationActor = {},
  input: ArchiveFundScenarioSetV1 = {}
): Promise<{
  response: FundScenarioCapitalSetSummaryV1 & { archivedAt: string };
  serializedResponse: string;
}> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const raw = await fetchRawScenarioSet(client, fundId, scenarioSetId, { forUpdate: true });
    requireScenarioSetFamily(raw, 'capital_plan');
    if (raw.row.archived_at === null) {
      const actor = normalizeActor(actorInput);
      raw.row = await updateArchivedScenarioSet(client, fundId, scenarioSetId, actor);
      await insertScenarioSetEvent(client, {
        scenarioSetId,
        fundId,
        eventType: 'archived',
        actor,
        changeSummary: buildArchiveChangeSummary(input.reason),
      });
    }
    const detail = await fetchCapitalScenarioSetDetailFromRaw(client, raw);
    const response = {
      ...mapScenarioSetSummary(raw.row),
      overrideType: 'capital_plan' as const,
      baselineVariantId: detail.baselineVariantId,
      sourceBundleHash: detail.sourceBundleHash,
      interpretationVersion: detail.interpretationVersion,
      readState: detail.readState,
      archivedAt: detail.archivedAt!,
    };
    if (!FundScenarioCapitalArchiveResponseV1Schema.safeParse(response).success) {
      throw createHttpError(500, 'Capital archive response failed validation', {
        code: 'scenario_response_invalid',
      });
    }
    return { response, serializedResponse: JSON.stringify(response) };
  });
}

async function archiveFundScenarioSetInTransaction(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string,
  actorInput: FundScenarioMutationActor,
  input: ArchiveFundScenarioSetV1
): Promise<FundScenarioSetSummaryV1> {
  await verifyFundExists(client, fundId);
  const raw = await fetchRawScenarioSet(client, fundId, scenarioSetId, {
    forUpdate: true,
  });
  requireScenarioSetFamily(raw, 'legacy');
  const existing = raw.row;

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
        AND archived_at IS NULL
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
    throw createHttpError(404, 'Scenario set not found', {
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
