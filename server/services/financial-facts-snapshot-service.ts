import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { assertOwnedByFund, type FundScopedOwnershipDatabase } from '../lib/fund-scoped-ownership';
import { runIdempotentCommand } from '../lib/idempotent-command';
import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID,
  FINANCIAL_FACTS_POLICY_VERSION,
  FinancialFactsPayloadV1Schema,
  PersistedFinancialFactsSnapshotV1Schema,
  VolatileStrippedFundCompanyActualsFactsResponseSchema,
  buildSelectionSetHash,
  buildSnapshotInputHash,
  type FinancialFactsPayloadV1,
  type PersistedFinancialFactsSnapshotV1,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  DOMAIN_MEASURE_MATRIX,
  type MeasureKeyV2,
} from '../../shared/contracts/financial-observations/normalization.contract';
import {
  FINANCIAL_FACTS_CONSUMER_KEYS,
  type ConsumerEvaluation,
  type FinancialFactsConsumerKey,
} from '../../shared/contracts/financial-facts-consumer-policies';
import { Decimal } from '../../shared/lib/decimal-config';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import { toFixedDecimalString } from '../../shared/lib/decimal-string';
import { financialFactsSnapshots } from '../../shared/schema/financial-facts-snapshots';
import {
  sourceObservations,
  workingValueSelections,
} from '../../shared/schema/financial-observations';
import {
  cashFlowEvents,
  valuationMarks,
  vehicles,
} from '../../shared/schema/lp-reporting-evidence';
import { buildFundCompanyActualsFacts } from './fund-actuals/fund-company-actuals-facts-service';
import { isoDay, selectActiveValuationMarks } from './lp-reporting/active-valuation-mark-selector';
import type {
  CashFlowEventType,
  CashFlowPerspectiveLite,
  ParsedValuationMark,
} from './lp-reporting/metrics-engine';

const ACCEPTED_STATUSES = new Set(['approved', 'locked']);
const CASH_FLOW_TYPES = new Set<CashFlowEventType>([
  'lp_capital_call',
  'lp_distribution',
  'fund_expense',
  'portfolio_investment',
  'realized_proceeds',
  'recallable_distribution',
]);
const PERSPECTIVE_ORDER: readonly CashFlowPerspectiveLite[] = [
  'lp_net',
  'fund_gross',
  'vehicle',
  'company',
];
const SNAPSHOT_TRANSACTION_MAX_ATTEMPTS = 3;
const RETRYABLE_TRANSACTION_SQLSTATES = new Set(['40001', '40P01']);
const FINANCIAL_OBSERVATION_IMPORT_SOURCE = 'financial_observation_v2';

type SnapshotDatabase = typeof db;
type SnapshotRow = typeof financialFactsSnapshots.$inferSelect;
type VehicleRosterEntry = FinancialFactsPayloadV1['vehicleRoster'][number];
type CashFlowSeries = FinancialFactsPayloadV1['cashFlowSeries'];
type MarksSeries = FinancialFactsPayloadV1['marksSeries'];
type FinancialFactsWarning = CashFlowSeries['warnings'][number];

interface CashFlowRow {
  id: number;
  fundId: number;
  vehicleId: number | null;
  companyId: number | null;
  eventType: string;
  amount: string;
  currency: string;
  eventDate: Date;
  perspective: string;
  status: string;
  supersedesEventId: number | null;
  reversalOfEventId: number | null;
  importedFrom: string | null;
  sourceHash: string | null;
}

interface ValuationMarkRow {
  id: number;
  fundId: number;
  vehicleId: number | null;
  companyId: number;
  markDate: string;
  asOfDate: string;
  fairValue: string;
  currency: string;
  status: string;
  confidenceLevel: string;
  importedFrom: string | null;
  sourceHash: string | null;
}

interface AcceptedSourceObservationRow {
  id: number;
  fundId: number;
  companyIdentityId: number | null;
  domain: string;
  effectiveDate: string;
  normalizedPayload: Record<string, unknown>;
  observationHash: string;
  status: string;
}

interface LatestWorkingSelectionRow {
  id: number;
  fundId: number;
  consumer: string;
  companyIdentityId: number | null;
  domain: string;
  measureKey: string;
  selectedObservationId: number;
  isDefault: boolean;
}

interface CanonicalContributionInput {
  key: string;
  domain: 'ledger_event' | 'valuation';
  importedFrom: string | null;
  sourceHash: string | null;
}

interface ConsumerRequiredInputs {
  canonical: readonly CanonicalContributionInput[];
  hasUnlinkableDirectInput: boolean;
}

type ConsumerRequiredInputMap = Record<FinancialFactsConsumerKey, ConsumerRequiredInputs>;

interface CashFlowBuildResult {
  series: CashFlowSeries;
  canonicalInputs: CanonicalContributionInput[];
}

interface MarksBuildResult {
  series: MarksSeries;
  canonicalInputs: CanonicalContributionInput[];
}

interface SnapshotLineage {
  sourceObservationIds: number[];
  workingValueSelectionIds: number[];
  consumerEvaluations: ConsumerEvaluation[];
}

export class FinancialFactsSnapshotServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'FinancialFactsSnapshotServiceError';
    this.statusCode = status;
  }
}

export interface BuildFinancialFactsSnapshotInput {
  fundId: number;
  vehicleIds?: number[];
  asOfDate: string;
  knowledgeCutoff?: string;
  actorId: number;
  idempotencyKey: string;
  database?: SnapshotDatabase;
  now?: Date;
}

function stripGeneratedAtLeaves(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripGeneratedAtLeaves);
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  const stripped: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key !== 'generatedAt' && child !== undefined) {
      stripped[key] = stripGeneratedAtLeaves(child);
    }
  }
  return stripped;
}

function eventDateTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isCashFlowType(value: string): value is Exclude<CashFlowEventType, 'reversal'> {
  return CASH_FLOW_TYPES.has(value as CashFlowEventType);
}

function isPerspective(value: string): value is CashFlowPerspectiveLite {
  return PERSPECTIVE_ORDER.includes(value as CashFlowPerspectiveLite);
}

function cashSeriesKey(row: CashFlowRow): string {
  return `${row.eventType}:${row.vehicleId ?? 'fund'}`;
}

function preferredPerspective(rows: readonly CashFlowRow[]): CashFlowPerspectiveLite {
  for (const perspective of PERSPECTIVE_ORDER) {
    if (rows.some((row) => row.perspective === perspective)) {
      return perspective;
    }
  }
  throw new FinancialFactsSnapshotServiceError(
    422,
    'CASH_FLOW_PERSPECTIVE_INVALID',
    'An accepted cash-flow event has an unsupported perspective.'
  );
}

function sumCashRows(
  rows: readonly CashFlowRow[],
  eventTypes: ReadonlySet<CashFlowEventType>
): Decimal {
  return rows.reduce(
    (sum, row) => (eventTypes.has(row.eventType as CashFlowEventType) ? sum.plus(row.amount) : sum),
    new Decimal(0)
  );
}

function policyVersionLabel(policyVersion: string): string {
  return policyVersion.split('/').at(-1) ?? policyVersion;
}

function buildCashFlowSeries(
  rows: readonly CashFlowRow[],
  asOfDate: string,
  policyVersion: string
): CashFlowBuildResult {
  const referencedIds = new Set<number>();
  for (const row of rows) {
    if (row.reversalOfEventId !== null) referencedIds.add(row.reversalOfEventId);
    if (row.supersedesEventId !== null) referencedIds.add(row.supersedesEventId);
  }

  const eligible = rows.filter(
    (row) =>
      ACCEPTED_STATUSES.has(row.status) &&
      isCashFlowType(row.eventType) &&
      isPerspective(row.perspective) &&
      isoDay(row.eventDate) <= asOfDate &&
      row.reversalOfEventId === null &&
      row.supersedesEventId === null &&
      !referencedIds.has(row.id)
  );

  const warnings: FinancialFactsWarning[] = eligible
    .filter((row) => row.currency !== 'USD')
    .sort((left, right) => left.id - right.id)
    .map((row) => ({
      code: 'NON_USD_CASH_FLOW_EXCLUDED' as const,
      severity: 'warning' as const,
      message: `Cash-flow event ${row.id} was excluded because policy ${policyVersionLabel(
        policyVersion
      )} accepts USD only.`,
      source: `cash_flow_events:${row.id}`,
    }));

  const usdRows = eligible.filter((row) => row.currency === 'USD');
  const grouped = new Map<string, CashFlowRow[]>();
  for (const row of usdRows) {
    const key = cashSeriesKey(row);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  const selectedRows = Array.from(grouped.values()).flatMap((group) => {
    const perspective = preferredPerspective(group);
    return group.filter((row) => row.perspective === perspective);
  });
  selectedRows.sort((left, right) => {
    const dateOrder = eventDateTime(left.eventDate).localeCompare(eventDateTime(right.eventDate));
    return dateOrder !== 0 ? dateOrder : left.id - right.id;
  });

  const selectedGroups = new Map<string, CashFlowRow[]>();
  for (const row of selectedRows) {
    const key = cashSeriesKey(row);
    const group = selectedGroups.get(key);
    if (group) group.push(row);
    else selectedGroups.set(key, [row]);
  }

  const series = Array.from(selectedGroups.values())
    .map((group) => ({
      eventType: group[0]!.eventType as Exclude<CashFlowEventType, 'reversal'>,
      vehicleId: group[0]!.vehicleId,
      perspective: group[0]!.perspective as CashFlowPerspectiveLite,
      points: group.map((row) => ({
        eventId: row.id,
        effectiveAt: eventDateTime(row.eventDate),
        amount: toFixedDecimalString(row.amount, 6),
      })),
    }))
    .sort((left, right) => {
      const typeOrder = left.eventType.localeCompare(right.eventType);
      if (typeOrder !== 0) return typeOrder;
      return (left.vehicleId ?? 0) - (right.vehicleId ?? 0);
    });

  const recallable = sumCashRows(selectedRows, new Set(['recallable_distribution']));
  const calledCapital = sumCashRows(selectedRows, new Set(['lp_capital_call']));
  const distributions = sumCashRows(
    selectedRows,
    new Set(['lp_distribution', 'realized_proceeds'])
  );

  return {
    series: {
      series,
      totals: {
        contributions: toFixedDecimalString(calledCapital.minus(recallable), 6),
        distributions: toFixedDecimalString(distributions, 6),
        recallableDistributions: toFixedDecimalString(recallable, 6),
      },
      warnings,
    },
    canonicalInputs: selectedRows.map((row) => ({
      key: `cash_flow_events:${row.id}`,
      domain: 'ledger_event',
      importedFrom: row.importedFrom ?? null,
      sourceHash: row.sourceHash ?? null,
    })),
  };
}

function toSelectableMark(row: ValuationMarkRow): ParsedValuationMark {
  const confidenceLevel =
    row.confidenceLevel === 'high' || row.confidenceLevel === 'low'
      ? row.confidenceLevel
      : 'medium';
  return {
    id: row.id,
    companyId: row.companyId,
    fairValue: row.fairValue,
    markDate: isoDay(row.markDate),
    asOfDate: isoDay(row.asOfDate),
    status: row.status === 'locked' ? 'locked' : 'approved',
    confidenceLevel,
  };
}

function buildMarksSeries(rows: readonly ValuationMarkRow[], asOfDate: string): MarksBuildResult {
  const acceptedRows = rows
    .filter(
      (row) =>
        ACCEPTED_STATUSES.has(row.status) &&
        row.currency === 'USD' &&
        isoDay(row.markDate) <= asOfDate &&
        isoDay(row.asOfDate) <= asOfDate
    )
    .sort((left, right) => {
      const dateOrder = isoDay(left.markDate).localeCompare(isoDay(right.markDate));
      return dateOrder !== 0 ? dateOrder : left.id - right.id;
    });
  const selectable = acceptedRows.map(toSelectableMark);
  const periodEnds = Array.from(new Set(acceptedRows.map((row) => isoDay(row.asOfDate)))).sort();

  const periodNav = periodEnds.map((periodEnd) => {
    const { active } = selectActiveValuationMarks(selectable, periodEnd);
    const stale = active.some((mark) => isoDay(mark.markDate) < periodEnd);
    const warnings: MarksSeries['periodNav'][number]['warnings'] = stale
      ? [
          {
            code: 'VALUATION_MARK_STALE',
            severity: 'warning',
            message: `NAV at ${periodEnd} carries at least one valuation mark forward from an earlier date.`,
            source: 'valuation_marks',
          },
        ]
      : [];
    const nav = active.reduce((sum, mark) => sum.plus(mark.fairValue), new Decimal(0));
    return { periodEnd, nav: toFixedDecimalString(nav, 6), warnings };
  });

  return {
    series: {
      marks: acceptedRows.map((row) => ({
        markId: row.id,
        companyId: row.companyId,
        vehicleId: row.vehicleId,
        effectiveAt: isoDay(row.markDate),
        fairValue: toFixedDecimalString(row.fairValue, 6),
        currency: 'USD' as const,
      })),
      periodNav,
      warnings: [],
    },
    canonicalInputs: acceptedRows.map((row) => ({
      key: `valuation_marks:${row.id}`,
      domain: 'valuation',
      importedFrom: row.importedFrom ?? null,
      sourceHash: row.sourceHash ?? null,
    })),
  };
}

function isFinancialFactsConsumerKey(value: string): value is FinancialFactsConsumerKey {
  return FINANCIAL_FACTS_CONSUMER_KEYS.some((consumer) => consumer === value);
}

function observationMeasureKey(row: AcceptedSourceObservationRow): MeasureKeyV2 | null {
  const measureKey = row.normalizedPayload['measureKey'];
  return typeof measureKey === 'string' ? (measureKey as MeasureKeyV2) : null;
}

function observationHasCompatibleDomain(
  row: AcceptedSourceObservationRow,
  requiredDomain: CanonicalContributionInput['domain']
): boolean {
  if (row.domain !== requiredDomain || row.normalizedPayload['domain'] !== requiredDomain) {
    return false;
  }
  const measureKey = observationMeasureKey(row);
  if (measureKey === null) return false;
  return (DOMAIN_MEASURE_MATRIX[requiredDomain].measures as readonly string[]).includes(measureKey);
}

function observationContributesTo(
  row: AcceptedSourceObservationRow,
  canonical: CanonicalContributionInput,
  fundId: number,
  asOfDate: string
): boolean {
  return (
    row.fundId === fundId &&
    row.status === 'accepted' &&
    row.effectiveDate <= asOfDate &&
    canonical.importedFrom === FINANCIAL_OBSERVATION_IMPORT_SOURCE &&
    canonical.sourceHash !== null &&
    canonical.sourceHash.length === 64 &&
    canonical.sourceHash === row.observationHash &&
    observationHasCompatibleDomain(row, canonical.domain)
  );
}

function buildSnapshotLineage(params: {
  fundId: number;
  asOfDate: string;
  requiredInputs: ConsumerRequiredInputMap;
  acceptedObservations: readonly AcceptedSourceObservationRow[];
  latestSelections: readonly LatestWorkingSelectionRow[];
}): SnapshotLineage {
  const linkedCanonicalKeys = new Map<FinancialFactsConsumerKey, Set<string>>();
  const contributingObservationIds = new Map<FinancialFactsConsumerKey, Set<number>>();
  const selectedIds = new Set<number>();
  const nonDefaultSelectionConsumers = new Set<FinancialFactsConsumerKey>();
  const sourceIds = new Set<number>();
  const observationById = new Map(params.acceptedObservations.map((row) => [row.id, row]));

  for (const consumer of FINANCIAL_FACTS_CONSUMER_KEYS) {
    const linkedKeys = new Set<string>();
    const consumerObservationIds = new Set<number>();
    for (const canonical of params.requiredInputs[consumer].canonical) {
      const contributing = params.acceptedObservations.find((observation) =>
        observationContributesTo(observation, canonical, params.fundId, params.asOfDate)
      );
      if (!contributing) continue;
      linkedKeys.add(canonical.key);
      consumerObservationIds.add(contributing.id);
      sourceIds.add(contributing.id);
    }
    linkedCanonicalKeys.set(consumer, linkedKeys);
    contributingObservationIds.set(consumer, consumerObservationIds);
  }

  for (const selection of params.latestSelections) {
    if (
      selection.fundId !== params.fundId ||
      !isFinancialFactsConsumerKey(selection.consumer) ||
      !contributingObservationIds.get(selection.consumer)?.has(selection.selectedObservationId)
    ) {
      continue;
    }
    const selectedObservation = observationById.get(selection.selectedObservationId);
    if (
      !selectedObservation ||
      selection.domain !== selectedObservation.domain ||
      selection.measureKey !== observationMeasureKey(selectedObservation)
    ) {
      continue;
    }
    selectedIds.add(selection.id);
    if (!selection.isDefault) {
      nonDefaultSelectionConsumers.add(selection.consumer);
    }
  }

  const consumerEvaluations = FINANCIAL_FACTS_CONSUMER_KEYS.map((consumer) => {
    const required = params.requiredInputs[consumer];
    const linked = linkedCanonicalKeys.get(consumer) ?? new Set<string>();
    const reasons: ConsumerEvaluation['reasons'] = [];
    if (
      required.hasUnlinkableDirectInput ||
      required.canonical.some((canonical) => !linked.has(canonical.key))
    ) {
      reasons.push('unattributed_legacy_direct');
    }
    if (nonDefaultSelectionConsumers.has(consumer)) {
      reasons.push('working_value_selection_deviation');
    }
    return {
      consumer,
      status: reasons.length > 0 ? ('blocked' as const) : ('accepted' as const),
      reasons,
    };
  });

  return {
    sourceObservationIds: [...sourceIds].sort((left, right) => left - right),
    workingValueSelectionIds: [...selectedIds].sort((left, right) => left - right),
    consumerEvaluations,
  };
}

async function executeRows<T>(
  database: Pick<SnapshotDatabase, 'execute'>,
  query: SQL
): Promise<T[]> {
  const result = (await database.execute(query)) as { rows?: T[] } | T[];
  if (Array.isArray(result)) return result;
  return result.rows ?? [];
}

async function readAcceptedSourceObservations(
  database: SnapshotDatabase,
  fundId: number,
  asOfDate: string
): Promise<AcceptedSourceObservationRow[]> {
  const rows = await database
    .select({
      id: sourceObservations.id,
      fundId: sourceObservations.fundId,
      companyIdentityId: sourceObservations.companyIdentityId,
      domain: sourceObservations.domain,
      effectiveDate: sourceObservations.effectiveDate,
      normalizedPayload: sourceObservations.normalizedPayload,
      observationHash: sourceObservations.observationHash,
      status: sourceObservations.status,
    })
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.fundId, fundId),
        eq(sourceObservations.status, 'accepted'),
        lte(sourceObservations.effectiveDate, asOfDate)
      )
    )
    .orderBy(asc(sourceObservations.id));
  return rows as AcceptedSourceObservationRow[];
}

async function readLatestWorkingSelections(
  database: SnapshotDatabase,
  fundId: number,
  asOfDate: string
): Promise<LatestWorkingSelectionRow[]> {
  return executeRows<LatestWorkingSelectionRow>(
    database,
    sql`
      WITH ranked_working_value_selections AS (
        SELECT
          selection.id AS "id",
          selection.fund_id AS "fundId",
          selection.consumer AS "consumer",
          selection.company_identity_id AS "companyIdentityId",
          selection.domain AS "domain",
          selection.measure_key AS "measureKey",
          selection.selected_observation_id AS "selectedObservationId",
          selection.is_default AS "isDefault",
          ROW_NUMBER() OVER (
            PARTITION BY
              selection.fund_id,
              selection.consumer,
              selection.domain,
              selection.measure_key,
              COALESCE(selection.company_identity_id, 0)
            ORDER BY selection.as_of_date DESC, selection.id DESC
          ) AS selection_rank
        FROM ${workingValueSelections} AS selection
        INNER JOIN ${sourceObservations} AS observation
          ON observation.id = selection.selected_observation_id
         AND observation.fund_id = selection.fund_id
        WHERE selection.fund_id = ${fundId}
          AND selection.superseded_by_selection_id IS NULL
          AND selection.as_of_date <= ${asOfDate}
          AND observation.status = 'accepted'
          AND observation.effective_date <= ${asOfDate}
      )
      SELECT
        "id",
        "fundId",
        "consumer",
        "companyIdentityId",
        "domain",
        "measureKey",
        "selectedObservationId",
        "isDefault"
      FROM ranked_working_value_selections
      WHERE selection_rank = 1
      ORDER BY "id" ASC
    `
  );
}

function computeSnapshotInputHash(input: Parameters<typeof buildSnapshotInputHash>[0]): string {
  try {
    return buildSnapshotInputHash(input);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'Scientific notation is not allowed in decimal-string hash inputs.'
    ) {
      throw error;
    }

    // Wave A's unanchored scientific-notation guard also matches SHA-256
    // substrings such as the policy 1.0.0 empty-selection hash (`be150...`).
    // The payload has already passed its decimal-string schemas, so retain the
    // contract's exact canonical preimage while leaving the protected helper
    // unchanged in this service-only slice.
    return canonicalSha256({
      fundId: input.fundId,
      vehicleIds: [...input.vehicleIds].sort((left, right) => left - right),
      asOfDate: input.asOfDate,
      knowledgeCutoff: input.knowledgeCutoff,
      policyVersion: input.policyVersion,
      selectionSetHash: input.selectionSetHash,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID,
      payload: input.payload,
    });
  }
}

function snapshotFromRow(row: SnapshotRow): PersistedFinancialFactsSnapshotV1 {
  return PersistedFinancialFactsSnapshotV1Schema.parse({
    policyVersion: row.policyVersion,
    fundId: row.fundId,
    asOfDate: row.asOfDate,
    knowledgeCutoff: row.knowledgeCutoff.toISOString(),
    vehicleScope: row.vehicleScope,
    vehicleIds: row.vehicleIds,
    selectionSetHash: row.selectionSetHash,
    sourceFactsInputHash: row.sourceFactsInputHash,
    snapshotInputHash: row.snapshotInputHash,
    consumerEvaluations: row.consumerEvaluations,
    payload: row.payload,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  });
}

async function readVehicleRoster(
  database: SnapshotDatabase,
  fundId: number
): Promise<VehicleRosterEntry[]> {
  const rows = await database
    .select({
      vehicleId: vehicles.id,
      vehicleType: vehicles.vehicleType,
      vehicleSlug: vehicles.vehicleSlug,
      name: vehicles.name,
      currency: vehicles.currency,
    })
    .from(vehicles)
    .where(eq(vehicles.fundId, fundId))
    .orderBy(asc(vehicles.id));

  return rows.map((row) => ({
    vehicleId: row.vehicleId,
    vehicleType: row.vehicleType as VehicleRosterEntry['vehicleType'],
    vehicleSlug: row.vehicleSlug,
    name: row.name,
    currency: row.currency,
  }));
}

async function validateVehicleScope(params: {
  database: SnapshotDatabase;
  fundId: number;
  suppliedVehicleIds: number[] | undefined;
  roster: readonly VehicleRosterEntry[];
  policyVersion: string;
}): Promise<number[]> {
  const rosterIds = params.roster
    .map((entry) => entry.vehicleId)
    .sort((left, right) => left - right);
  if (params.suppliedVehicleIds === undefined) return rosterIds;

  const suppliedIds = [...params.suppliedVehicleIds].sort((left, right) => left - right);
  const rosterSet = new Set(rosterIds);
  for (const vehicleId of suppliedIds) {
    if (!rosterSet.has(vehicleId)) {
      await assertOwnedByFund({
        db: params.database as unknown as FundScopedOwnershipDatabase,
        fundId: params.fundId,
        ref: { kind: 'vehicle', id: vehicleId },
      });
    }
  }

  if (
    suppliedIds.length !== rosterIds.length ||
    suppliedIds.some((vehicleId, index) => vehicleId !== rosterIds[index])
  ) {
    throw new FinancialFactsSnapshotServiceError(
      422,
      'VEHICLE_SCOPE_UNSUPPORTED',
      `Policy ${policyVersionLabel(
        params.policyVersion
      )} supports only the complete fund vehicle roster.`,
      { expectedVehicleIds: rosterIds }
    );
  }
  return rosterIds;
}

export async function getLatestFinancialFactsSnapshot(opts: {
  fundId: number;
  database?: SnapshotDatabase;
}): Promise<SnapshotRow | null> {
  const database = opts.database ?? db;
  const [latest] = await database
    .select()
    .from(financialFactsSnapshots)
    .where(eq(financialFactsSnapshots.fundId, opts.fundId))
    .orderBy(desc(financialFactsSnapshots.createdAt))
    .limit(1);

  return latest ?? null;
}

function transactionSqlState(error: unknown): string | undefined {
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record['code'] === 'string') return record['code'];
    current = record['cause'];
  }
  return undefined;
}

function valuationContributionInput(row: ValuationMarkRow): CanonicalContributionInput {
  return {
    key: `valuation_marks:${row.id}`,
    domain: 'valuation',
    importedFrom: row.importedFrom ?? null,
    sourceHash: row.sourceHash ?? null,
  };
}

async function buildFinancialFactsSnapshotInTransaction(params: {
  input: BuildFinancialFactsSnapshotInput;
  database: SnapshotDatabase;
  now: Date;
  knowledgeCutoff: string;
}): Promise<PersistedFinancialFactsSnapshotV1> {
  const { input, database, now, knowledgeCutoff } = params;
  const roster = await readVehicleRoster(database, input.fundId);
  const vehicleIds = await validateVehicleScope({
    database,
    fundId: input.fundId,
    suppliedVehicleIds: input.vehicleIds,
    roster,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
  });

  const cashRows = (await database
    .select({
      id: cashFlowEvents.id,
      fundId: cashFlowEvents.fundId,
      vehicleId: cashFlowEvents.vehicleId,
      companyId: cashFlowEvents.companyId,
      eventType: cashFlowEvents.eventType,
      amount: cashFlowEvents.amount,
      currency: cashFlowEvents.currency,
      eventDate: cashFlowEvents.eventDate,
      perspective: cashFlowEvents.perspective,
      status: cashFlowEvents.status,
      supersedesEventId: cashFlowEvents.supersedesEventId,
      reversalOfEventId: cashFlowEvents.reversalOfEventId,
      importedFrom: cashFlowEvents.importedFrom,
      sourceHash: cashFlowEvents.sourceHash,
    })
    .from(cashFlowEvents)
    .where(eq(cashFlowEvents.fundId, input.fundId))
    .orderBy(asc(cashFlowEvents.eventDate), asc(cashFlowEvents.id))) as CashFlowRow[];
  const markRows = (await database
    .select({
      id: valuationMarks.id,
      fundId: valuationMarks.fundId,
      vehicleId: valuationMarks.vehicleId,
      companyId: valuationMarks.companyId,
      markDate: valuationMarks.markDate,
      asOfDate: valuationMarks.asOfDate,
      fairValue: valuationMarks.fairValue,
      currency: valuationMarks.currency,
      status: valuationMarks.status,
      confidenceLevel: valuationMarks.confidenceLevel,
      importedFrom: valuationMarks.importedFrom,
      sourceHash: valuationMarks.sourceHash,
    })
    .from(valuationMarks)
    .where(eq(valuationMarks.fundId, input.fundId))
    .orderBy(asc(valuationMarks.markDate), asc(valuationMarks.id))) as ValuationMarkRow[];
  const actuals = await buildFundCompanyActualsFacts({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    now,
    database,
  });
  const acceptedObservations = await readAcceptedSourceObservations(
    database,
    input.fundId,
    input.asOfDate
  );
  const latestSelections = await readLatestWorkingSelections(
    database,
    input.fundId,
    input.asOfDate
  );

  const companyActuals = VolatileStrippedFundCompanyActualsFactsResponseSchema.parse(
    stripGeneratedAtLeaves(actuals)
  );
  const cashFlow = buildCashFlowSeries(cashRows, input.asOfDate, FINANCIAL_FACTS_POLICY_VERSION);
  const marks = buildMarksSeries(markRows, input.asOfDate);
  const markById = new Map(markRows.map((row) => [row.id, row]));
  const reserveMarkIds = [
    ...new Set(
      companyActuals.facts.flatMap((fact) =>
        fact.approvedPlanningFmvMarkId === null ? [] : [fact.approvedPlanningFmvMarkId]
      )
    ),
  ].sort((left, right) => left - right);
  const reserveCanonicalInputs = reserveMarkIds.map((markId) => {
    const row = markById.get(markId);
    return row
      ? valuationContributionInput(row)
      : {
          key: `valuation_marks:${markId}`,
          domain: 'valuation' as const,
          importedFrom: null,
          sourceHash: null,
        };
  });
  const requiredInputs: ConsumerRequiredInputMap = {
    forecast: {
      canonical: [],
      hasUnlinkableDirectInput: companyActuals.facts.length > 0,
    },
    reserve: {
      canonical: reserveCanonicalInputs,
      hasUnlinkableDirectInput: false,
    },
    economics: {
      canonical: cashFlow.canonicalInputs,
      hasUnlinkableDirectInput: false,
    },
    periodic_analysis: {
      canonical: marks.canonicalInputs,
      hasUnlinkableDirectInput: false,
    },
  };
  const lineage = buildSnapshotLineage({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    requiredInputs,
    acceptedObservations,
    latestSelections,
  });
  const selectionSetHash = buildSelectionSetHash({
    sourceObservationIds: lineage.sourceObservationIds,
    workingValueSelectionIds: lineage.workingValueSelectionIds,
  });
  const payload = FinancialFactsPayloadV1Schema.parse({
    companyActuals,
    sourceObservationIds: lineage.sourceObservationIds,
    workingValueSelectionIds: lineage.workingValueSelectionIds,
    participationTermRefs: [],
    cashFlowSeries: cashFlow.series,
    marksSeries: marks.series,
    vehicleRoster: roster,
  });
  const snapshotInputHash = computeSnapshotInputHash({
    fundId: input.fundId,
    vehicleIds,
    asOfDate: input.asOfDate,
    knowledgeCutoff,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
    selectionSetHash,
    payload,
  });

  const result = await runIdempotentCommand<SnapshotRow>({
    db: database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    contractVersion: FINANCIAL_FACTS_POLICY_VERSION,
    request: {
      fundId: input.fundId,
      contractVersion: FINANCIAL_FACTS_POLICY_VERSION,
      asOfDate: input.asOfDate,
      vehicleIds,
      actorId: input.actorId,
      selectionSetHash,
    },
    loadExisting: async () => {
      const [existing] = await database
        .select()
        .from(financialFactsSnapshots)
        .where(
          and(
            eq(financialFactsSnapshots.fundId, input.fundId),
            eq(financialFactsSnapshots.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      return existing ? { row: existing, requestHash: existing.requestHash } : null;
    },
    insert: async (requestHash) => {
      const [inserted] = await database
        .insert(financialFactsSnapshots)
        .values({
          fundId: input.fundId,
          policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
          payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID,
          asOfDate: input.asOfDate,
          knowledgeCutoff: now,
          vehicleScope: 'fund_all',
          vehicleIds,
          selectionSetHash,
          sourceFactsInputHash: companyActuals.inputHash,
          snapshotInputHash,
          payload,
          consumerEvaluations: lineage.consumerEvaluations,
          actorId: input.actorId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [financialFactsSnapshots.fundId, financialFactsSnapshots.idempotencyKey],
        })
        .returning();
      return inserted ?? null;
    },
  });

  return snapshotFromRow(result.row);
}

export async function buildFinancialFactsSnapshot(
  input: BuildFinancialFactsSnapshotInput
): Promise<PersistedFinancialFactsSnapshotV1> {
  if (input.knowledgeCutoff !== undefined) {
    throw new FinancialFactsSnapshotServiceError(
      400,
      'CUTOFF_NOT_ACCEPTED',
      'knowledgeCutoff is assigned by the server when the snapshot is created.'
    );
  }

  const database = input.database ?? db;
  const now = input.now === undefined ? new Date() : new Date(input.now.getTime());
  const knowledgeCutoff = now.toISOString();

  for (let attempt = 1; attempt <= SNAPSHOT_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await database.transaction(
        async (transaction) =>
          buildFinancialFactsSnapshotInTransaction({
            input,
            database: transaction,
            now,
            knowledgeCutoff,
          }),
        { isolationLevel: 'repeatable read', accessMode: 'read write' }
      );
    } catch (error) {
      const retryable = RETRYABLE_TRANSACTION_SQLSTATES.has(transactionSqlState(error) ?? '');
      if (!retryable || attempt === SNAPSHOT_TRANSACTION_MAX_ATTEMPTS) throw error;
    }
  }

  throw new Error('Financial-facts snapshot transaction retry bound was exhausted.');
}
