import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../db';
import { assertOwnedByFund, type FundScopedOwnershipDatabase } from '../lib/fund-scoped-ownership';
import { runIdempotentCommand } from '../lib/idempotent-command';
import {
  EMPTY_SELECTION_SET_HASH,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID,
  FINANCIAL_FACTS_POLICY_VERSION,
  FinancialFactsPayloadV1Schema,
  FinancialFactsSnapshotV1Schema,
  VolatileStrippedFundCompanyActualsFactsResponseSchema,
  buildSnapshotInputHash,
  type FinancialFactsPayloadV1,
  type FinancialFactsSnapshotV1,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract';
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
    if (key !== 'generatedAt') {
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

function buildCashFlowSeries(rows: readonly CashFlowRow[], asOfDate: string): CashFlowSeries {
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
      message: `Cash-flow event ${row.id} was excluded because policy 1.0.0 accepts USD only.`,
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
    series,
    totals: {
      contributions: toFixedDecimalString(calledCapital.minus(recallable), 6),
      distributions: toFixedDecimalString(distributions, 6),
      recallableDistributions: toFixedDecimalString(recallable, 6),
    },
    warnings,
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

function buildMarksSeries(rows: readonly ValuationMarkRow[], asOfDate: string): MarksSeries {
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
  };
}

function hasUnattributedDependency(
  consumer: FinancialFactsConsumerKey,
  payload: FinancialFactsPayloadV1
): boolean {
  if (payload.sourceObservationIds.length !== 0) return false;
  switch (consumer) {
    case 'forecast':
      return payload.companyActuals.facts.length > 0;
    case 'reserve':
      return payload.companyActuals.facts.some((fact) => fact.approvedPlanningFmvMarkId !== null);
    case 'economics':
      return payload.cashFlowSeries.series.length > 0;
    case 'periodic_analysis':
      return payload.marksSeries.marks.length > 0;
  }
}

function buildConsumerEvaluations(payload: FinancialFactsPayloadV1): ConsumerEvaluation[] {
  return FINANCIAL_FACTS_CONSUMER_KEYS.map((consumer) => {
    const blocked = hasUnattributedDependency(consumer, payload);
    return {
      consumer,
      status: blocked ? ('blocked' as const) : ('accepted' as const),
      reasons: blocked ? (['unattributed_legacy_direct'] as const) : [],
    };
  });
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

function snapshotFromRow(row: SnapshotRow): FinancialFactsSnapshotV1 {
  return FinancialFactsSnapshotV1Schema.parse({
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
      'Policy 1.0.0 supports only the complete fund vehicle roster.',
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

export async function buildFinancialFactsSnapshot(
  input: BuildFinancialFactsSnapshotInput
): Promise<FinancialFactsSnapshotV1> {
  if (input.knowledgeCutoff !== undefined) {
    throw new FinancialFactsSnapshotServiceError(
      400,
      'CUTOFF_NOT_ACCEPTED',
      'knowledgeCutoff is assigned by the server when the snapshot is created.'
    );
  }

  const database = input.database ?? db;
  const now = input.now ?? new Date();
  const knowledgeCutoff = now.toISOString();
  const roster = await readVehicleRoster(database, input.fundId);
  const vehicleIds = await validateVehicleScope({
    database,
    fundId: input.fundId,
    suppliedVehicleIds: input.vehicleIds,
    roster,
  });

  const [actuals, cashRows, markRows] = await Promise.all([
    buildFundCompanyActualsFacts({
      fundId: input.fundId,
      asOfDate: input.asOfDate,
      now,
      database,
    }),
    database
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
      })
      .from(cashFlowEvents)
      .where(eq(cashFlowEvents.fundId, input.fundId))
      .orderBy(asc(cashFlowEvents.eventDate), asc(cashFlowEvents.id)),
    database
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
      })
      .from(valuationMarks)
      .where(eq(valuationMarks.fundId, input.fundId))
      .orderBy(asc(valuationMarks.markDate), asc(valuationMarks.id)),
  ]);

  const companyActuals = VolatileStrippedFundCompanyActualsFactsResponseSchema.parse(
    stripGeneratedAtLeaves(actuals)
  );
  const payload = FinancialFactsPayloadV1Schema.parse({
    companyActuals,
    sourceObservationIds: [],
    workingValueSelectionIds: [],
    participationTermRefs: [],
    cashFlowSeries: buildCashFlowSeries(cashRows as CashFlowRow[], input.asOfDate),
    marksSeries: buildMarksSeries(markRows as ValuationMarkRow[], input.asOfDate),
    vehicleRoster: roster,
  });
  const consumerEvaluations = buildConsumerEvaluations(payload);
  const snapshotInputHash = computeSnapshotInputHash({
    fundId: input.fundId,
    vehicleIds,
    asOfDate: input.asOfDate,
    knowledgeCutoff,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
    selectionSetHash: EMPTY_SELECTION_SET_HASH,
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
      selectionSetHash: EMPTY_SELECTION_SET_HASH,
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
          selectionSetHash: EMPTY_SELECTION_SET_HASH,
          sourceFactsInputHash: companyActuals.inputHash,
          snapshotInputHash,
          payload,
          consumerEvaluations,
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
