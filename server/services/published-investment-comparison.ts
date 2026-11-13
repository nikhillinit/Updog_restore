import { and, eq, inArray } from 'drizzle-orm';
import Decimal from '@shared/lib/decimal-config';
import { cashFlowEvents } from '@shared/schema/lp-reporting-evidence';
import { vehicles } from '@shared/schema/vehicles';
import { ActualsPilotCashFlowPayloadSchema } from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  InvestmentComparisonSchema,
  PublishedFundActualsSchema,
  type InvestmentComparison,
  type InvestmentComparisonOptions,
  type PublishedFundActuals,
  type PublishedInvestmentPeriod,
  type PublishedInvestmentTotals,
} from '@shared/contracts/dual-forecast/investment-comparison.contract';
import { db } from '../db';
import { withReadSavepoint } from '../db/request-context';
import { logger } from '../lib/logger';
import { getTerminalFinancialFactsHead } from './financial-facts-snapshot-service';
import { parsePersistedFactsRow } from './financial-facts/parse-persisted-facts-row';
import { readForecastInvestmentBaseline } from './forecast-investment-baseline';

export interface PublishedInvestment {
  eventId: number;
  companyId: number;
  effectiveDate: string;
  amount: string;
  category: 'initial' | 'follow_on' | 'secondary' | 'other';
}

interface PublishedInvestmentFact extends PublishedInvestment {
  vehicleId: number | null;
}

interface PublishedFactsBasis {
  snapshotId: number;
  snapshotInputHash: string;
  snapshotAsOfDate: string;
  knowledgeCutoff: string;
}

type PublishedInvestmentFactsRead =
  | { kind: 'none' }
  | { kind: 'legacy-snapshot'; basis: PublishedFactsBasis }
  | {
      kind: 'unavailable';
      basis: PublishedFactsBasis | null;
      reason: string;
      eventTypes?: string[];
      disclosures?: string[];
      error?: unknown;
    }
  | {
      kind: 'facts';
      basis: PublishedFactsBasis;
      eventTypes: string[];
      disclosures: string[];
      investments: PublishedInvestmentFact[];
    };

const RECONCILIATION_FAILURE_REASON =
  'Published investment records could not be reconciled to their immutable facts snapshot.';
const INVESTMENT_ONLY_UNSUPPORTED_REASON =
  'This publication admits investment transactions only; capital calls, paid-in cash, valuations, and distributions need separate admitted evidence.';
const MIXED_UNSUPPORTED_REASON =
  "The dashboard does not yet reconcile this publication's capital-call, valuation, or distribution evidence. Review it under LP reporting actuals.";
const READER_FAILURE_REASON = 'Published investment actuals could not be read.';

function emptyTotals(): PublishedInvestmentTotals {
  return {
    deployedCapital: '0',
    initialCapital: '0',
    followOnCapital: '0',
    transactionCount: 0,
    companyCount: 0,
  };
}

/** Slice a pinned publication by effective date, never by current ledger eligibility. */
export function aggregatePublishedInvestments(
  investments: readonly PublishedInvestment[],
  asOfDate: string
): { actual: PublishedInvestmentTotals; periods: PublishedInvestmentPeriod[] } {
  const actual = emptyTotals();
  const seenEvents = new Set<number>();
  const companies = new Set<number>();
  const periods = new Map<string, PublishedInvestmentPeriod>();
  const periodCompanies = new Map<string, Set<number>>();
  const sorted = [...investments].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.eventId - b.eventId
  );
  for (const investment of sorted) {
    if (seenEvents.has(investment.eventId))
      throw new Error('Duplicate published investment identity');
    seenEvents.add(investment.eventId);
    if (investment.effectiveDate > asOfDate) continue;
    const amount = new Decimal(investment.amount);
    if (!amount.isFinite() || amount.lt(0)) throw new Error('Invalid published investment amount');
    const month = Number(investment.effectiveDate.slice(5, 7));
    const period = `${investment.effectiveDate.slice(0, 4)}-Q${Math.ceil(month / 3)}`;
    const row = periods.get(period) ?? {
      ...emptyTotals(),
      period,
      newCompanies: 0,
      cumulativeCapital: '0',
      cumulativeCompanies: 0,
    };
    const inPeriod = periodCompanies.get(period) ?? new Set<number>();
    const field = {
      initial: 'initialCapital',
      follow_on: 'followOnCapital',
      secondary: 'secondaryCapital',
      other: 'otherCapital',
    }[investment.category] as
      'initialCapital' | 'followOnCapital' | 'secondaryCapital' | 'otherCapital';
    for (const totals of [actual, row]) {
      totals.deployedCapital = new Decimal(totals.deployedCapital).plus(amount).toFixed(6);
      totals[field] = new Decimal(totals[field] ?? '0').plus(amount).toFixed(6);
      totals.transactionCount += 1;
    }
    if (!companies.has(investment.companyId)) row.newCompanies += 1;
    companies.add(investment.companyId);
    inPeriod.add(investment.companyId);
    actual.companyCount = companies.size;
    row.companyCount = inPeriod.size;
    row.cumulativeCapital = actual.deployedCapital;
    row.cumulativeCompanies = companies.size;
    periods.set(period, row);
    periodCompanies.set(period, inPeriod);
  }
  return { actual, periods: [...periods.values()] };
}

const DISCLOSURES = [
  'Actuals include only investment records admitted to the selected publication, sliced by effective date as known at its knowledge cutoff.',
  'Missing periods mean no published records; they do not certify zero investment activity or a complete financial close.',
  'Company count means distinct companies receiving published cash investments. Follow-ons do not add companies; independent holdings and uninvested identities are excluded.',
  'Investment deployment does not establish LP calls, paid-in cash, expenses, distributions, valuations, or NAV.',
  'A selected saved forecast is a comparison baseline, not an automatically certified original plan. Its commitments remain frozen.',
  'Forecast totals include completed calendar months only; actuals include the requested day. Calendar alignment uses the explicitly selected baseline start month.',
  'The saved forecast schedule is modeled investment demand and may include demand beyond the fund term; it does not establish available cash or funding approval.',
];

async function readPublishedInvestmentFacts(fundId: number): Promise<PublishedInvestmentFactsRead> {
  const head = await getTerminalFinancialFactsHead({ fundId });
  if (head.kind === 'none') return { kind: 'none' };
  if (head.kind !== 'head') {
    return {
      kind: 'unavailable',
      basis: null,
      reason: 'Published facts lineage is ambiguous or invalid.',
    };
  }

  const basis: PublishedFactsBasis = {
    snapshotId: head.row.id,
    snapshotInputHash: head.row.snapshotInputHash,
    snapshotAsOfDate: head.row.asOfDate,
    knowledgeCutoff: head.row.knowledgeCutoff.toISOString(),
  };
  let eventTypes: string[] = [];
  let disclosures: string[] = [];
  try {
    const parsed = parsePersistedFactsRow(head.row, { allowRestatement: true });
    // Older Round/FMV snapshots are not actuals-pilot investment publications.
    // Preserve their existing forecast lane unless a comparison was requested.
    if (parsed.kind === 'facts' && !('capitalActuals' in parsed.snapshot.payload))
      return { kind: 'legacy-snapshot', basis };
    if (parsed.kind !== 'facts' || !('capitalActuals' in parsed.snapshot.payload)) {
      return {
        kind: 'unavailable',
        basis,
        reason: 'This publication does not contain supported investment actuals.',
      };
    }
    const snapshot = parsed.snapshot;
    if (snapshot.fundId !== fundId) throw new Error('Published facts fund mismatch');
    const cashFlowSeries = snapshot.payload.cashFlowSeries;
    disclosures = cashFlowSeries.warnings.map((warning) => warning.message);
    eventTypes = cashFlowSeries.series.map((series) => series.eventType);
    const points = cashFlowSeries.series
      .filter((series) => series.eventType === 'portfolio_investment')
      .flatMap((series) =>
        series.points.map((point) => ({
          ...point,
          vehicleId: series.vehicleId,
          perspective: series.perspective,
        }))
      );
    const ids = points.map((point) => point.eventId);
    const rows =
      ids.length === 0
        ? []
        : await db
            .select()
            .from(cashFlowEvents)
            .where(and(eq(cashFlowEvents.fundId, fundId), inArray(cashFlowEvents.id, ids)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const investments = points.map((point): PublishedInvestmentFact => {
      const row = byId.get(point.eventId);
      const payload = ActualsPilotCashFlowPayloadSchema.safeParse(row?.payload);
      if (
        !row ||
        row.fundId !== fundId ||
        row.companyId == null ||
        row.currency !== 'USD' ||
        !['approved', 'locked'].includes(row.status) ||
        row.eventType !== 'portfolio_investment' ||
        row.vehicleId !== point.vehicleId ||
        row.perspective !== point.perspective ||
        new Date(row.eventDate).toISOString() !== point.effectiveAt ||
        !new Decimal(row.amount).eq(point.amount) ||
        !payload.success ||
        payload.data.deploymentCategory === null
      ) {
        throw new Error('Published investment provenance is incomplete');
      }
      return {
        eventId: row.id,
        companyId: row.companyId,
        vehicleId: row.vehicleId,
        effectiveDate: point.effectiveAt.slice(0, 10),
        amount: point.amount,
        category: payload.data.deploymentCategory,
      };
    });
    return { kind: 'facts', basis, eventTypes, disclosures, investments };
  } catch (error) {
    return {
      kind: 'unavailable',
      basis,
      reason: RECONCILIATION_FAILURE_REASON,
      eventTypes,
      disclosures,
      error,
    };
  }
}

export async function readPublishedInvestmentComparison(
  fundId: number,
  options: InvestmentComparisonOptions = {},
  now = new Date()
): Promise<InvestmentComparison | null> {
  const asOfDate = options.asOfDate ?? now.toISOString().slice(0, 10);
  const facts = await readPublishedInvestmentFacts(fundId);
  if (
    (facts.kind === 'none' || facts.kind === 'legacy-snapshot') &&
    Object.keys(options).length === 0
  )
    return null;

  const result: InvestmentComparison = {
    status: 'unavailable',
    asOfDate,
    basis: null,
    actual: null,
    periods: [],
    baseline: null,
    reason: null,
    baselineReason:
      'Select a saved forecast and its calendar start month to compare planned investment activity.',
    disclosures: [...DISCLOSURES],
  };
  const { baselineSnapshotId, baselineStartMonth } = options;
  if (baselineSnapshotId && baselineStartMonth) {
    try {
      result.baseline = await withReadSavepoint(db, () =>
        readForecastInvestmentBaseline(fundId, baselineSnapshotId, baselineStartMonth, asOfDate)
      );
      result.baselineReason = result.baseline
        ? null
        : 'The selected saved forecast has no usable investment schedule.';
    } catch {
      result.baselineReason = 'The selected saved forecast could not be validated for this fund.';
    }
  }

  if (facts.kind === 'none') {
    result.reason = 'No published investment facts are available.';
    return InvestmentComparisonSchema.parse(result);
  }
  if (facts.kind === 'legacy-snapshot') {
    result.basis = facts.basis;
    result.reason = 'This publication does not contain supported investment actuals.';
    return InvestmentComparisonSchema.parse(result);
  }
  if (facts.kind === 'unavailable') {
    result.basis = facts.basis;
    result.disclosures.push(...(facts.disclosures ?? []));
    result.reason = facts.reason;
    return InvestmentComparisonSchema.parse(result);
  }

  result.basis = facts.basis;
  result.disclosures.push(...facts.disclosures);
  if (facts.investments.length === 0) {
    result.reason = 'No investment records were admitted to this publication.';
  } else {
    try {
      Object.assign(result, aggregatePublishedInvestments(facts.investments, asOfDate));
      result.status = 'available';
      if (asOfDate > facts.basis.snapshotAsOfDate)
        result.disclosures.push(
          `Published coverage ends on ${facts.basis.snapshotAsOfDate}; later activity is unknown.`
        );
    } catch {
      result.reason = RECONCILIATION_FAILURE_REASON;
    }
  }
  return InvestmentComparisonSchema.parse(result);
}

function unsupportedReason(eventTypes: readonly string[]): string {
  return eventTypes.length > 0 &&
    eventTypes.every((eventType) => eventType === 'portfolio_investment')
    ? INVESTMENT_ONLY_UNSUPPORTED_REASON
    : MIXED_UNSUPPORTED_REASON;
}

function buildUnavailableFundActuals(
  asOfDate: string,
  basis: PublishedFactsBasis | null,
  reason: string,
  eventTypes: readonly string[] = [],
  disclosures: string[] = []
): PublishedFundActuals {
  return PublishedFundActualsSchema.parse({
    contractVersion: 'published-fund-actuals/1.0.0',
    status: 'unavailable',
    asOfDate,
    basis,
    vehicleScope: 'main_fund',
    investments: null,
    reason,
    unsupportedReason: unsupportedReason(eventTypes),
    disclosures,
  });
}

export async function readPublishedFundActuals(
  fundId: number,
  now = new Date()
): Promise<PublishedFundActuals | null> {
  const asOfDate = now.toISOString().slice(0, 10);
  let basis: PublishedFactsBasis | null = null;
  let eventTypes: string[] = [];
  let disclosures: string[] = [];

  try {
    const facts = await readPublishedInvestmentFacts(fundId);
    if (facts.kind === 'none' || facts.kind === 'legacy-snapshot') return null;
    basis = facts.basis;
    if (facts.kind === 'unavailable') {
      eventTypes = facts.eventTypes ?? [];
      disclosures = facts.disclosures ?? [];
      if ('error' in facts)
        logger.warn({ fundId, error: facts.error }, 'Failed to read published fund actuals');
      return buildUnavailableFundActuals(asOfDate, basis, facts.reason, eventTypes, disclosures);
    }

    eventTypes = facts.eventTypes;
    disclosures = [...facts.disclosures];
    if (asOfDate > facts.basis.snapshotAsOfDate)
      disclosures.push(
        `Published coverage ends on ${facts.basis.snapshotAsOfDate}; later activity is unknown.`
      );

    const [mainFundVehicle] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.fundId, fundId),
          eq(vehicles.vehicleType, 'main_fund'),
          eq(vehicles.status, 'active')
        )
      );
    const investments = facts.investments.filter(
      (investment) => mainFundVehicle && investment.vehicleId === mainFundVehicle.id
    );
    const excludedCount = facts.investments.length - investments.length;
    if (excludedCount > 0)
      disclosures.push(
        `Excluded ${excludedCount} published investment transaction(s) from vehicles outside the active main_fund.`
      );

    if (!mainFundVehicle)
      return buildUnavailableFundActuals(
        asOfDate,
        basis,
        'No active main_fund vehicle is available for this fund.',
        eventTypes,
        disclosures
      );
    if (investments.length === 0)
      return buildUnavailableFundActuals(
        asOfDate,
        basis,
        'No investment records were admitted to the active main_fund vehicle.',
        eventTypes,
        disclosures
      );

    const { actual } = aggregatePublishedInvestments(investments, asOfDate);
    return PublishedFundActualsSchema.parse({
      contractVersion: 'published-fund-actuals/1.0.0',
      status: 'available',
      asOfDate,
      basis,
      vehicleScope: 'main_fund',
      investments: actual,
      reason: null,
      unsupportedReason: unsupportedReason(eventTypes),
      disclosures,
    });
  } catch (error) {
    logger.warn({ fundId, error }, 'Failed to read published fund actuals');
    return buildUnavailableFundActuals(
      asOfDate,
      basis,
      READER_FAILURE_REASON,
      eventTypes,
      disclosures
    );
  }
}
