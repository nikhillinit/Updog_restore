import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { assertOwnedByFund, type FundScopedOwnershipDatabase } from '../lib/fund-scoped-ownership';
import { runIdempotentCommand } from '../lib/idempotent-command';
import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
  FINANCIAL_FACTS_POLICY_VERSION,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FinancialFactsPayloadV1Schema,
  FinancialFactsPayloadV2Schema,
  PersistedFinancialFactsSnapshotV1Schema,
  VolatileStrippedFundCompanyActualsFactsResponseSchema,
  buildSelectionSetHash,
  buildSnapshotInputHash,
  type FinancialFactsPayloadV1,
  type FinancialFactsPayloadV2,
  type PersistedFinancialFactsSnapshotV1,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  DOMAIN_MEASURE_MATRIX,
  type MeasureKeyV2,
} from '../../shared/contracts/financial-observations/normalization.contract';
import {
  FINANCIAL_FACTS_CONSUMER_KEYS,
  type ConsumerEvaluation,
  type ConsumerEvaluationReasonV2,
  type ConsumerEvaluationV2,
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
type PositionRef = FinancialFactsPayloadV2['positionRefs'][number];
type PositionComponentRef = FinancialFactsPayloadV2['positionComponentRefs'][number];
type OwnershipRef = FinancialFactsPayloadV2['ownershipRefs'][number];
type ValuationRef = FinancialFactsPayloadV2['valuationRefs'][number];
type ParticipationTermRef = FinancialFactsPayloadV2['participationTermRefs'][number];

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
  markPurpose: string;
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

type RawRow = Record<string, unknown>;

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

interface TermRefRow extends ParticipationTermRef {
  readonly vehicleId: number;
  readonly companyIdentityId: number;
  readonly isCurrent: boolean;
}

interface ComponentTermRow extends TermRefRow {
  readonly kind: PositionComponentRef['kind'];
}

interface PositionCompanyRef {
  readonly vehicleId: number;
  readonly companyIdentityId: number;
  readonly companyId: number;
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
  asOfDate: string,
  knowledgeCutoff: string
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
        lte(sourceObservations.effectiveDate, asOfDate),
        lte(sourceObservations.createdAt, new Date(knowledgeCutoff))
      )
    )
    .orderBy(asc(sourceObservations.id));
  return rows as AcceptedSourceObservationRow[];
}

async function readLatestWorkingSelections(
  database: SnapshotDatabase,
  fundId: number,
  asOfDate: string,
  knowledgeCutoff: string
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
          AND selection.as_of_date <= ${asOfDate}
          AND selection.created_at <= ${new Date(knowledgeCutoff)}
          AND observation.status = 'accepted'
          AND observation.effective_date <= ${asOfDate}
          AND observation.created_at <= ${new Date(knowledgeCutoff)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${workingValueSelections} successor
            WHERE successor.fund_id = selection.fund_id
              AND successor.id = selection.superseded_by_selection_id
              AND successor.as_of_date <= ${asOfDate}
              AND successor.created_at <= ${new Date(knowledgeCutoff)}
          )
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

async function readPositionRefs(params: {
  database: SnapshotDatabase;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
}): Promise<PositionRef[]> {
  const rows = await executeRows<RawRow>(
    params.database,
    sql`
      /* financial_facts_v2_position_refs */
      SELECT
        event.id AS "positionEventId",
        event.event_type AS "eventType",
        event.vehicle_id AS "vehicleId",
        event.company_identity_id AS "companyIdentityId",
        event.vehicle_participation_id AS "vehicleParticipationId",
        event.resulting_participation_id AS "resultingParticipationId",
        event.source_observation_id AS "sourceObservationId",
        event.effective_date AS "effectiveDate",
        event.recorded_at AS "recordedAt"
      FROM position_events event
      WHERE event.fund_id = ${params.fundId}
        AND event.effective_date <= ${params.asOfDate}
        AND event.recorded_at <= ${new Date(params.knowledgeCutoff)}
        AND event.event_type <> 'reversal'
        AND NOT EXISTS (
          SELECT 1
          FROM position_events reversal
          WHERE reversal.fund_id = event.fund_id
            AND reversal.reverses_position_event_id = event.id
            AND reversal.effective_date <= ${params.asOfDate}
            AND reversal.recorded_at <= ${new Date(params.knowledgeCutoff)}
        )
      ORDER BY event.id ASC
    `
  );

  return rows.map((row) => ({
    positionEventId: asPositiveInt(row['positionEventId']),
    eventType: asString(row['eventType']),
    vehicleId: asPositiveInt(row['vehicleId']),
    companyIdentityId: asPositiveInt(row['companyIdentityId']),
    vehicleParticipationId: asNullablePositiveInt(row['vehicleParticipationId']),
    resultingParticipationId: asNullablePositiveInt(row['resultingParticipationId']),
    sourceObservationId: asNullablePositiveInt(row['sourceObservationId']),
    effectiveDate: asDateString(row['effectiveDate']),
    recordedAt: asDateTimeString(row['recordedAt']),
  }));
}

async function readComponentTermRows(params: {
  database: SnapshotDatabase;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
}): Promise<ComponentTermRow[]> {
  const rows = await executeRows<RawRow>(
    params.database,
    sql`
      /* financial_facts_v2_participation_term_refs */
      WITH position_participations AS (
        SELECT DISTINCT
          event.vehicle_id,
          event.company_identity_id,
          event.vehicle_participation_id AS participation_id,
          CASE
            WHEN event.event_type = 'conversion' THEN 'conversion_source'
            ELSE 'position_source'
          END AS link_kind
        FROM position_events event
        WHERE event.fund_id = ${params.fundId}
          AND event.effective_date <= ${params.asOfDate}
          AND event.recorded_at <= ${new Date(params.knowledgeCutoff)}
          AND event.vehicle_participation_id IS NOT NULL
          AND event.event_type <> 'reversal'
          AND NOT EXISTS (
            SELECT 1
            FROM position_events reversal
            WHERE reversal.fund_id = event.fund_id
              AND reversal.reverses_position_event_id = event.id
              AND reversal.effective_date <= ${params.asOfDate}
              AND reversal.recorded_at <= ${new Date(params.knowledgeCutoff)}
          )
        UNION
        SELECT DISTINCT
          event.vehicle_id,
          event.company_identity_id,
          event.resulting_participation_id AS participation_id,
          'conversion_result' AS link_kind
        FROM position_events event
        WHERE event.fund_id = ${params.fundId}
          AND event.effective_date <= ${params.asOfDate}
          AND event.recorded_at <= ${new Date(params.knowledgeCutoff)}
          AND event.resulting_participation_id IS NOT NULL
          AND event.event_type <> 'reversal'
          AND NOT EXISTS (
            SELECT 1
            FROM position_events reversal
            WHERE reversal.fund_id = event.fund_id
              AND reversal.reverses_position_event_id = event.id
              AND reversal.effective_date <= ${params.asOfDate}
              AND reversal.recorded_at <= ${new Date(params.knowledgeCutoff)}
          )
      )
      SELECT DISTINCT
        participation.id AS "participationId",
        participation.version AS "participationVersion",
        tranche.id AS "financingTrancheId",
        tranche.version AS "trancheVersion",
        source.vehicle_id AS "vehicleId",
        source.company_identity_id AS "companyIdentityId",
        (
          NOT EXISTS (
            SELECT 1
            FROM vehicle_financing_participations participation_successor
            INNER JOIN financing_tranches participation_successor_tranche
              ON participation_successor_tranche.id =
                 participation_successor.financing_tranche_id
             AND participation_successor_tranche.fund_id = participation_successor.fund_id
            WHERE participation_successor.id = participation.superseded_by_participation_id
              AND participation_successor.fund_id = participation.fund_id
              AND participation_successor.vehicle_id = participation.vehicle_id
              AND participation_successor.created_at <= ${new Date(params.knowledgeCutoff)}
              AND COALESCE(
                    participation_successor.closing_date,
                    participation_successor_tranche.closing_date
                  ) <= ${params.asOfDate}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM financing_tranches tranche_successor
            WHERE tranche_successor.id = tranche.superseded_by_tranche_id
              AND tranche_successor.fund_id = tranche.fund_id
              AND tranche_successor.closing_date <= ${params.asOfDate}
              AND tranche_successor.created_at <= ${new Date(params.knowledgeCutoff)}
          )
        ) AS "isCurrent",
        CASE
          WHEN source.link_kind = 'conversion_source' THEN 'conversion_source'
          WHEN source.link_kind = 'conversion_result' THEN 'conversion_result'
          WHEN tranche.security_type = 'equity' THEN 'priced'
          ELSE 'contingent'
        END AS "kind"
      FROM position_participations source
      INNER JOIN vehicle_financing_participations participation
        ON participation.id = source.participation_id
       AND participation.fund_id = ${params.fundId}
       AND participation.created_at <= ${new Date(params.knowledgeCutoff)}
      INNER JOIN financing_tranches tranche
        ON tranche.id = participation.financing_tranche_id
       AND tranche.fund_id = participation.fund_id
       AND tranche.created_at <= ${new Date(params.knowledgeCutoff)}
       AND COALESCE(participation.closing_date, tranche.closing_date) <= ${params.asOfDate}
      ORDER BY
        source.vehicle_id ASC,
        source.company_identity_id ASC,
        participation.id ASC,
        tranche.id ASC
    `
  );

  return rows.map((row) => ({
    participationId: asPositiveInt(row['participationId']),
    participationVersion: asPositiveInt(row['participationVersion']),
    financingTrancheId: asPositiveInt(row['financingTrancheId']),
    trancheVersion: asPositiveInt(row['trancheVersion']),
    vehicleId: asPositiveInt(row['vehicleId']),
    companyIdentityId: asPositiveInt(row['companyIdentityId']),
    isCurrent: asBoolean(row['isCurrent']),
    kind: asPositionComponentKind(row['kind']),
  }));
}

async function readOwnershipRefs(params: {
  database: SnapshotDatabase;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
}): Promise<OwnershipRef[]> {
  const rows = await executeRows<RawRow>(
    params.database,
    sql`
      /* financial_facts_v2_ownership_refs */
      SELECT
        snapshot.id AS "ownershipSnapshotId",
        snapshot.vehicle_id AS "vehicleId",
        snapshot.company_identity_id AS "companyIdentityId",
        snapshot.source_observation_id AS "sourceObservationId",
        snapshot.effective_date AS "effectiveDate",
        snapshot.recorded_at AS "recordedAt"
      FROM ownership_snapshots snapshot
      WHERE snapshot.fund_id = ${params.fundId}
        AND snapshot.effective_date <= ${params.asOfDate}
        AND snapshot.recorded_at <= ${new Date(params.knowledgeCutoff)}
        AND NOT EXISTS (
          SELECT 1
          FROM ownership_snapshots successor
          WHERE successor.fund_id = snapshot.fund_id
            AND successor.supersedes_snapshot_id = snapshot.id
            AND successor.effective_date <= ${params.asOfDate}
            AND successor.recorded_at <= ${new Date(params.knowledgeCutoff)}
        )
      ORDER BY snapshot.id ASC
    `
  );

  return rows.map((row) => ({
    ownershipSnapshotId: asPositiveInt(row['ownershipSnapshotId']),
    vehicleId: asPositiveInt(row['vehicleId']),
    companyIdentityId: asPositiveInt(row['companyIdentityId']),
    sourceObservationId: asPositiveInt(row['sourceObservationId']),
    effectiveDate: asDateString(row['effectiveDate']),
    recordedAt: asDateTimeString(row['recordedAt']),
  }));
}

async function readPositionCompanyRefs(params: {
  database: SnapshotDatabase;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
}): Promise<PositionCompanyRef[]> {
  const rows = await executeRows<RawRow>(
    params.database,
    sql`
      /* financial_facts_v2_position_company_refs */
      SELECT DISTINCT
        event.vehicle_id AS "vehicleId",
        event.company_identity_id AS "companyIdentityId",
        link.portfolio_company_id AS "companyId"
      FROM position_events event
      INNER JOIN portfolio_company_identity_links link
        ON link.fund_id = event.fund_id
       AND link.company_identity_id = event.company_identity_id
       AND link.active = TRUE
      WHERE event.fund_id = ${params.fundId}
        AND event.effective_date <= ${params.asOfDate}
        AND event.recorded_at <= ${new Date(params.knowledgeCutoff)}
        AND event.event_type <> 'reversal'
        AND (event.vehicle_participation_id IS NOT NULL OR event.resulting_participation_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM position_events reversal
          WHERE reversal.fund_id = event.fund_id
            AND reversal.reverses_position_event_id = event.id
            AND reversal.effective_date <= ${params.asOfDate}
            AND reversal.recorded_at <= ${new Date(params.knowledgeCutoff)}
        )
      ORDER BY event.vehicle_id ASC, event.company_identity_id ASC, link.portfolio_company_id ASC
    `
  );

  return rows.map((row) => ({
    vehicleId: asPositiveInt(row['vehicleId']),
    companyIdentityId: asPositiveInt(row['companyIdentityId']),
    companyId: asPositiveInt(row['companyId']),
  }));
}

async function readDirectValuationRefs(params: {
  database: SnapshotDatabase;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
}): Promise<ValuationRef[]> {
  const rows = await executeRows<RawRow>(
    params.database,
    sql`
      /* financial_facts_v2_direct_valuation_refs */
      WITH ranked_direct_marks AS (
      SELECT
        mark.id AS "directMarkId",
        mark.vehicle_id AS "vehicleId",
        link.company_identity_id AS "companyIdentityId",
          mark.source_observation_id AS "directSourceObservationId",
          ROW_NUMBER() OVER (
            PARTITION BY mark.vehicle_id, link.company_identity_id
            ORDER BY mark.mark_date DESC, mark.id DESC
          ) AS mark_rank
      FROM valuation_marks mark
      INNER JOIN portfolio_company_identity_links link
        ON link.fund_id = mark.fund_id
       AND link.portfolio_company_id = mark.company_id
       AND link.active = TRUE
        INNER JOIN source_observations observation
          ON observation.id = mark.source_observation_id
         AND observation.fund_id = mark.fund_id
         AND observation.company_identity_id = link.company_identity_id
         AND observation.domain = 'valuation'
         AND observation.status = 'accepted'
         AND observation.effective_date <= ${params.asOfDate}
         AND observation.created_at <= ${new Date(params.knowledgeCutoff)}
      WHERE mark.fund_id = ${params.fundId}
        AND mark.mark_purpose = 'direct_position_fmv'
        AND mark.status IN ('approved', 'locked')
        AND mark.vehicle_id IS NOT NULL
        AND mark.source_observation_id IS NOT NULL
        AND mark.mark_date <= ${params.asOfDate}
        AND mark.as_of_date <= ${params.asOfDate}
        AND mark.created_at <= ${new Date(params.knowledgeCutoff)}
          AND COALESCE(mark.approved_at, mark.locked_at, mark.created_at) <= ${new Date(
            params.knowledgeCutoff
          )}
      )
      SELECT
        "directMarkId",
        "vehicleId",
        "companyIdentityId",
        "directSourceObservationId"
      FROM ranked_direct_marks
      WHERE mark_rank = 1
      ORDER BY "vehicleId" ASC, "companyIdentityId" ASC, "directMarkId" ASC
    `
  );

  return rows.map((row) => ({
    basis: 'direct',
    vehicleId: asPositiveInt(row['vehicleId']),
    companyIdentityId: asPositiveInt(row['companyIdentityId']),
    directMarkId: asPositiveInt(row['directMarkId']),
    directSourceObservationId: asPositiveInt(row['directSourceObservationId']),
    ownershipSnapshotId: null,
    derivedTrancheId: null,
    derivedTrancheVersion: null,
    derivedParticipationId: null,
    derivedParticipationVersion: null,
  }));
}

async function readDerivedValuationRefs(params: {
  database: SnapshotDatabase;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
}): Promise<ValuationRef[]> {
  const rows = await executeRows<RawRow>(
    params.database,
    sql`
      /* financial_facts_v2_derived_valuation_refs */
      WITH terminal_ownership AS (
        SELECT
          snapshot.id AS ownership_snapshot_id,
          snapshot.vehicle_id,
          snapshot.company_identity_id
        FROM ownership_snapshots snapshot
        WHERE snapshot.fund_id = ${params.fundId}
          AND snapshot.effective_date <= ${params.asOfDate}
          AND snapshot.recorded_at <= ${new Date(params.knowledgeCutoff)}
          AND NOT EXISTS (
            SELECT 1
            FROM ownership_snapshots successor
            WHERE successor.fund_id = snapshot.fund_id
              AND successor.supersedes_snapshot_id = snapshot.id
              AND successor.effective_date <= ${params.asOfDate}
              AND successor.recorded_at <= ${new Date(params.knowledgeCutoff)}
          )
      ),
      ranked_post_money AS (
        SELECT
          ownership.ownership_snapshot_id AS "ownershipSnapshotId",
          ownership.vehicle_id AS "vehicleId",
          ownership.company_identity_id AS "companyIdentityId",
          tranche.id AS "derivedTrancheId",
          tranche.version AS "derivedTrancheVersion",
          participation.id AS "derivedParticipationId",
          participation.version AS "derivedParticipationVersion",
          ROW_NUMBER() OVER (
            PARTITION BY ownership.vehicle_id, ownership.company_identity_id
            ORDER BY COALESCE(participation.closing_date, tranche.closing_date) DESC,
                     tranche.id DESC,
                     participation.id DESC
          ) AS evidence_rank
        FROM terminal_ownership ownership
        INNER JOIN financing_events event
          ON event.fund_id = ${params.fundId}
         AND event.company_identity_id = ownership.company_identity_id
         AND event.created_at <= ${new Date(params.knowledgeCutoff)}
        INNER JOIN financing_tranches tranche
          ON tranche.financing_event_id = event.id
         AND tranche.fund_id = event.fund_id
         AND tranche.security_type = 'equity'
         AND tranche.created_at <= ${new Date(params.knowledgeCutoff)}
        INNER JOIN vehicle_financing_participations participation
          ON participation.financing_tranche_id = tranche.id
         AND participation.fund_id = tranche.fund_id
         AND participation.vehicle_id = ownership.vehicle_id
         AND participation.created_at <= ${new Date(params.knowledgeCutoff)}
        INNER JOIN source_observations observation
          ON observation.id = tranche.source_observation_id
         AND observation.fund_id = tranche.fund_id
         AND observation.company_identity_id = ownership.company_identity_id
         AND observation.domain = 'ledger_event'
         AND observation.status = 'accepted'
         AND observation.effective_date <= ${params.asOfDate}
         AND observation.created_at <= ${new Date(params.knowledgeCutoff)}
        WHERE COALESCE(participation.post_money_valuation, tranche.post_money_valuation) IS NOT NULL
          AND COALESCE(participation.closing_date, tranche.closing_date) <= ${params.asOfDate}
          AND NOT EXISTS (
            SELECT 1
            FROM vehicle_financing_participations participation_successor
            INNER JOIN financing_tranches participation_successor_tranche
              ON participation_successor_tranche.id =
                 participation_successor.financing_tranche_id
             AND participation_successor_tranche.fund_id = participation_successor.fund_id
            WHERE participation_successor.id = participation.superseded_by_participation_id
              AND participation_successor.fund_id = participation.fund_id
              AND participation_successor.vehicle_id = participation.vehicle_id
              AND participation_successor.created_at <= ${new Date(params.knowledgeCutoff)}
              AND COALESCE(
                    participation_successor.closing_date,
                    participation_successor_tranche.closing_date
                  ) <= ${params.asOfDate}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM financing_tranches tranche_successor
            WHERE tranche_successor.id = tranche.superseded_by_tranche_id
              AND tranche_successor.fund_id = tranche.fund_id
              AND tranche_successor.closing_date <= ${params.asOfDate}
              AND tranche_successor.created_at <= ${new Date(params.knowledgeCutoff)}
          )
      )
      SELECT
        "ownershipSnapshotId",
        "vehicleId",
        "companyIdentityId",
        "derivedTrancheId",
        "derivedTrancheVersion",
        "derivedParticipationId",
        "derivedParticipationVersion"
      FROM ranked_post_money
      WHERE evidence_rank = 1
      ORDER BY "vehicleId" ASC, "companyIdentityId" ASC, "ownershipSnapshotId" ASC
    `
  );

  return rows.map((row) => ({
    basis: 'derived',
    vehicleId: asPositiveInt(row['vehicleId']),
    companyIdentityId: asPositiveInt(row['companyIdentityId']),
    directMarkId: null,
    directSourceObservationId: null,
    ownershipSnapshotId: asPositiveInt(row['ownershipSnapshotId']),
    derivedTrancheId: asPositiveInt(row['derivedTrancheId']),
    derivedTrancheVersion: asPositiveInt(row['derivedTrancheVersion']),
    derivedParticipationId: asPositiveInt(row['derivedParticipationId']),
    derivedParticipationVersion: asPositiveInt(row['derivedParticipationVersion']),
  }));
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
      payloadSchemaId:
        'payloadSchemaId' in input && input.payloadSchemaId !== undefined
          ? input.payloadSchemaId
          : FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID,
      payload: input.payload,
    });
  }
}

function snapshotFromRow(row: SnapshotRow): PersistedFinancialFactsSnapshotV1 {
  const persisted = {
    policyVersion: row.policyVersion,
    payloadSchemaId: row.payloadSchemaId,
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
  };
  PersistedFinancialFactsSnapshotV1Schema.parse(persisted);

  return PersistedFinancialFactsSnapshotV1Schema.parse({
    policyVersion: row.policyVersion,
    ...(row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_1_0
      ? { payloadSchemaId: row.payloadSchemaId }
      : {}),
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

function asPositiveInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FinancialFactsSnapshotServiceError(
      500,
      'FACTS_SNAPSHOT_READ_FAILED',
      'Database returned invalid id.'
    );
  }
  return parsed;
}

function asNullablePositiveInt(value: unknown): number | null {
  return value === null || value === undefined ? null : asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new FinancialFactsSnapshotServiceError(
      500,
      'FACTS_SNAPSHOT_READ_FAILED',
      'Database returned invalid string.'
    );
  }
  return value;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return asString(value);
}

function asDateTimeString(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(asString(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new FinancialFactsSnapshotServiceError(
      500,
      'FACTS_SNAPSHOT_READ_FAILED',
      'Database returned invalid timestamp.'
    );
  }
  return parsed.toISOString();
}

function asBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new FinancialFactsSnapshotServiceError(
      500,
      'FACTS_SNAPSHOT_READ_FAILED',
      'Database returned invalid boolean.'
    );
  }
  return value;
}

function asPositionComponentKind(value: unknown): PositionComponentRef['kind'] {
  const parsed = asString(value);
  if (
    parsed === 'priced' ||
    parsed === 'contingent' ||
    parsed === 'conversion_source' ||
    parsed === 'conversion_result'
  ) {
    return parsed;
  }
  throw new FinancialFactsSnapshotServiceError(
    500,
    'FACTS_SNAPSHOT_READ_FAILED',
    'Database returned invalid position component kind.'
  );
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
    .where(
      and(
        eq(financialFactsSnapshots.fundId, opts.fundId),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${financialFactsSnapshots} successor
          WHERE successor.fund_id = ${financialFactsSnapshots.fundId}
            AND successor.supersedes_snapshot_id = ${financialFactsSnapshots.id}
        )`
      )
    )
    .orderBy(desc(financialFactsSnapshots.knowledgeCutoff), desc(financialFactsSnapshots.id))
    .limit(1);

  return latest ?? null;
}

async function getLatestTerminalFinancialFactsSnapshot(opts: {
  fundId: number;
  asOfDate: string;
  database: SnapshotDatabase;
}): Promise<SnapshotRow | null> {
  const [latest] = await opts.database
    .select()
    .from(financialFactsSnapshots)
    .where(
      and(
        eq(financialFactsSnapshots.fundId, opts.fundId),
        eq(financialFactsSnapshots.asOfDate, opts.asOfDate),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${financialFactsSnapshots} successor
          WHERE successor.fund_id = ${financialFactsSnapshots.fundId}
            AND successor.as_of_date = ${financialFactsSnapshots.asOfDate}
            AND successor.supersedes_snapshot_id = ${financialFactsSnapshots.id}
        )`
      )
    )
    .orderBy(desc(financialFactsSnapshots.knowledgeCutoff), desc(financialFactsSnapshots.id))
    .limit(1);

  return latest ?? null;
}

export async function getFinancialFactsSnapshotById(opts: {
  fundId: number;
  snapshotId: number;
  database?: SnapshotDatabase;
}): Promise<SnapshotRow | null> {
  const database = opts.database ?? db;
  const [selected] = await database
    .select()
    .from(financialFactsSnapshots)
    .where(
      and(
        eq(financialFactsSnapshots.fundId, opts.fundId),
        eq(financialFactsSnapshots.id, opts.snapshotId)
      )
    )
    .limit(1);

  return selected ?? null;
}

async function lockFactsGeneration(database: SnapshotDatabase, fundId: number): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`financial-facts:${fundId}`}))`);
}

function scopeKey(value: { vehicleId: number; companyIdentityId: number }): string {
  return `${value.vehicleId}:${value.companyIdentityId}`;
}

function buildParticipationTermRefs(rows: readonly ComponentTermRow[]): ParticipationTermRef[] {
  const byKey = new Map<string, ParticipationTermRef>();
  for (const row of rows) {
    const ref = {
      participationId: row.participationId,
      participationVersion: row.participationVersion,
      financingTrancheId: row.financingTrancheId,
      trancheVersion: row.trancheVersion,
    };
    byKey.set(JSON.stringify(ref), ref);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.participationId - right.participationId ||
      left.financingTrancheId - right.financingTrancheId
  );
}

function buildPositionComponentRefs(rows: readonly ComponentTermRow[]): PositionComponentRef[] {
  return rows.map((row) => ({
    vehicleId: row.vehicleId,
    companyIdentityId: row.companyIdentityId,
    kind: row.kind,
    participationId: row.participationId,
    participationVersion: row.participationVersion,
    financingTrancheId: row.financingTrancheId,
    trancheVersion: row.trancheVersion,
  }));
}

function buildValuationRefs(params: {
  positionRefs: readonly PositionRef[];
  ownershipRefs: readonly OwnershipRef[];
  directRefs: readonly ValuationRef[];
  derivedRefs: readonly ValuationRef[];
}): ValuationRef[] {
  const refsByScope = new Map<string, ValuationRef>();
  for (const directRef of params.directRefs) {
    const key = scopeKey(directRef);
    if (!refsByScope.has(key)) refsByScope.set(key, directRef);
  }

  for (const derivedRef of params.derivedRefs) {
    const key = scopeKey(derivedRef);
    if (!refsByScope.has(key)) refsByScope.set(key, derivedRef);
  }

  for (const ownershipRef of params.ownershipRefs) {
    const key = scopeKey(ownershipRef);
    if (refsByScope.has(key)) continue;
    refsByScope.set(key, {
      basis: 'unavailable',
      vehicleId: ownershipRef.vehicleId,
      companyIdentityId: ownershipRef.companyIdentityId,
      directMarkId: null,
      directSourceObservationId: null,
      ownershipSnapshotId: ownershipRef.ownershipSnapshotId,
      derivedTrancheId: null,
      derivedTrancheVersion: null,
      derivedParticipationId: null,
      derivedParticipationVersion: null,
    });
  }

  for (const positionRef of params.positionRefs) {
    const key = scopeKey(positionRef);
    if (refsByScope.has(key)) continue;
    refsByScope.set(key, {
      basis: 'unavailable',
      vehicleId: positionRef.vehicleId,
      companyIdentityId: positionRef.companyIdentityId,
      directMarkId: null,
      directSourceObservationId: null,
      ownershipSnapshotId: null,
      derivedTrancheId: null,
      derivedTrancheVersion: null,
      derivedParticipationId: null,
      derivedParticipationVersion: null,
    });
  }

  return [...refsByScope.values()].sort(
    (left, right) =>
      left.vehicleId - right.vehicleId ||
      left.companyIdentityId - right.companyIdentityId ||
      (left.directMarkId ?? 0) - (right.directMarkId ?? 0)
  );
}

function addConsumerReason(
  evaluation: ConsumerEvaluationV2,
  reason: ConsumerEvaluationReasonV2
): ConsumerEvaluationV2 {
  if (evaluation.reasons.includes(reason)) return evaluation;
  return {
    ...evaluation,
    status: 'blocked',
    reasons: [...evaluation.reasons, reason],
  };
}

function addConsumerDetail(
  evaluation: ConsumerEvaluationV2,
  detail: NonNullable<ConsumerEvaluationV2['details']>[number]
): ConsumerEvaluationV2 {
  return {
    ...evaluation,
    details: [...(evaluation.details ?? []), detail],
  };
}

function mergeV2ConsumerEvaluations(params: {
  base: readonly ConsumerEvaluation[];
  componentRows: readonly ComponentTermRow[];
  positionRefs: readonly PositionRef[];
  positionCompanyRefs: readonly PositionCompanyRef[];
  valuationRefs: readonly ValuationRef[];
  companyActuals: FinancialFactsPayloadV1['companyActuals'];
}): ConsumerEvaluationV2[] {
  return params.base.map((evaluation) => {
    if (evaluation.consumer !== 'forecast') return evaluation;

    let forecast: ConsumerEvaluationV2 = evaluation;
    const termsByScope = new Map<string, ComponentTermRow[]>();
    for (const row of params.componentRows) {
      const rows = termsByScope.get(scopeKey(row)) ?? [];
      rows.push(row);
      termsByScope.set(scopeKey(row), rows);
    }

    for (const [key, rows] of termsByScope) {
      const [vehicleId, companyIdentityId] = key.split(':').map((part) => Number(part));
      const hasCurrent = rows.some((row) => row.isCurrent);
      const hasStale = rows.some((row) => !row.isCurrent);
      if (hasCurrent && hasStale) {
        forecast = addConsumerReason(forecast, 'mixed_term_versions');
        forecast = addConsumerDetail(forecast, {
          code: 'mixed_term_versions',
          vehicleId,
          companyIdentityId,
          message: 'Position term references include both current and superseded terms.',
        });
      } else if (hasStale) {
        forecast = addConsumerDetail(forecast, {
          code: 'uniformly_stale_refs',
          vehicleId,
          companyIdentityId,
          message: 'Position term references are uniformly superseded at this cutoff.',
        });
      }
    }

    const valuatedScopes = new Set(
      params.valuationRefs
        .filter((ref) => ref.basis !== 'unavailable')
        .map((ref) => scopeKey(ref))
    );
    const reportedMissingValuationScopes = new Set<string>();
    for (const positionRef of params.positionRefs.filter((ref) => ref.eventType !== 'reversal')) {
      const key = scopeKey(positionRef);
      if (!valuatedScopes.has(key) && !reportedMissingValuationScopes.has(key)) {
        reportedMissingValuationScopes.add(key);
        forecast = addConsumerReason(forecast, 'position_valuation_incomplete');
        forecast = addConsumerDetail(forecast, {
          code: 'position_valuation_incomplete',
          vehicleId: positionRef.vehicleId,
          companyIdentityId: positionRef.companyIdentityId,
          message: 'Position exists without direct or derived valuation provenance.',
        });
      }
    }

    const ledgerPositionCompanyIds = new Set(params.positionCompanyRefs.map((ref) => ref.companyId));
    const legacyCompanyIds = [
      ...new Set(
        params.companyActuals.facts
          .filter((fact) => fact.provenance.core.sourceKind === 'legacy_unknown')
          .map((fact) => fact.companyId)
          .filter((id) => ledgerPositionCompanyIds.has(id))
      ),
    ].sort((left, right) => left - right);
    if (legacyCompanyIds.length > 0) {
      forecast = addConsumerDetail(forecast, {
        code: 'mixed_legacy_ledger_provenance',
        companyIds: legacyCompanyIds,
        message: 'Forecast payload contains legacy actuals and position-ledger provenance.',
      });
    }

    return forecast;
  });
}

async function buildPayloadV2(params: {
  database: SnapshotDatabase;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
  base: FinancialFactsPayloadV1;
  acceptedObservations: AcceptedSourceObservationRow[];
  sourceObservationIds: readonly number[];
  consumerEvaluations: readonly ConsumerEvaluation[];
}): Promise<{ payload: FinancialFactsPayloadV2; consumerEvaluations: ConsumerEvaluationV2[] }> {
  const [
    positionRefs,
    componentRows,
    ownershipRefs,
    directValuationRefs,
    derivedValuationRefs,
    positionCompanyRefs,
  ] = await Promise.all([
    readPositionRefs(params),
    readComponentTermRows(params),
    readOwnershipRefs(params),
    readDirectValuationRefs(params),
    readDerivedValuationRefs(params),
    readPositionCompanyRefs(params),
  ]);
  const valuationRefs = buildValuationRefs({
    positionRefs,
    ownershipRefs,
    directRefs: directValuationRefs,
    derivedRefs: derivedValuationRefs,
  });
  const observationIds = new Set<number>(params.sourceObservationIds);
  for (const positionRef of positionRefs) {
    if (positionRef.sourceObservationId !== null) observationIds.add(positionRef.sourceObservationId);
  }
  for (const ownershipRef of ownershipRefs) {
    observationIds.add(ownershipRef.sourceObservationId);
  }
  for (const valuationRef of valuationRefs) {
    if (valuationRef.directSourceObservationId !== null) {
      observationIds.add(valuationRef.directSourceObservationId);
    }
  }
  const acceptedObservationById = new Map(
    params.acceptedObservations.map((observation) => [observation.id, observation])
  );

  const payload = FinancialFactsPayloadV2Schema.parse({
    ...params.base,
    participationTermRefs: buildParticipationTermRefs(componentRows),
    positionRefs,
    positionComponentRefs: buildPositionComponentRefs(componentRows),
    ownershipRefs,
    valuationRefs,
    observationRefs: [...observationIds]
      .sort((left, right) => left - right)
      .flatMap((observationId) => {
        const observation = acceptedObservationById.get(observationId);
        return observation === undefined
          ? []
          : [
              {
                observationId: observation.id,
                domain: observation.domain,
                status: 'accepted' as const,
                effectiveDate: observation.effectiveDate,
              },
            ];
      }),
  });
  return {
    payload,
    consumerEvaluations: mergeV2ConsumerEvaluations({
      base: params.consumerEvaluations,
      componentRows,
      positionRefs,
      positionCompanyRefs,
      valuationRefs,
      companyActuals: params.base.companyActuals,
    }),
  };
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
  await lockFactsGeneration(database, input.fundId);
  const supersedesSnapshot = await getLatestTerminalFinancialFactsSnapshot({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    database,
  });

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
      markPurpose: valuationMarks.markPurpose,
      importedFrom: valuationMarks.importedFrom,
      sourceHash: valuationMarks.sourceHash,
    })
    .from(valuationMarks)
    .where(
      and(
        eq(valuationMarks.fundId, input.fundId),
        eq(valuationMarks.markPurpose, 'planning_company_fmv'),
        lte(valuationMarks.createdAt, new Date(knowledgeCutoff)),
        sql`COALESCE(${valuationMarks.approvedAt}, ${valuationMarks.lockedAt}, ${valuationMarks.createdAt}) <= ${new Date(
          knowledgeCutoff
        )}`
      )
    )
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
    input.asOfDate,
    knowledgeCutoff
  );
  const latestSelections = await readLatestWorkingSelections(
    database,
    input.fundId,
    input.asOfDate,
    knowledgeCutoff
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
  const payloadV1 = FinancialFactsPayloadV1Schema.parse({
    companyActuals,
    sourceObservationIds: lineage.sourceObservationIds,
    workingValueSelectionIds: lineage.workingValueSelectionIds,
    participationTermRefs: [],
    cashFlowSeries: cashFlow.series,
    marksSeries: marks.series,
    vehicleRoster: roster,
  });
  const payloadV2 = await buildPayloadV2({
    database,
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    knowledgeCutoff,
    base: payloadV1,
    acceptedObservations,
    sourceObservationIds: lineage.sourceObservationIds,
    consumerEvaluations: lineage.consumerEvaluations,
  });
  const { payload, consumerEvaluations } = payloadV2;
  const snapshotInputHash = computeSnapshotInputHash({
    fundId: input.fundId,
    vehicleIds,
    asOfDate: input.asOfDate,
    knowledgeCutoff,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
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
          payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
          asOfDate: input.asOfDate,
          knowledgeCutoff: now,
          vehicleScope: 'fund_all',
          vehicleIds,
          selectionSetHash,
          sourceFactsInputHash: companyActuals.inputHash,
          snapshotInputHash,
          payload,
          consumerEvaluations,
          actorId: input.actorId,
          supersedesSnapshotId: supersedesSnapshot?.id ?? null,
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
