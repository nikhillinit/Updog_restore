import { and, eq, inArray } from 'drizzle-orm';
import Decimal from '@shared/lib/decimal-config';
import { cashFlowEvents } from '@shared/schema/lp-reporting-evidence';
import { ActualsPilotCashFlowPayloadSchema } from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  InvestmentComparisonSchema,
  type InvestmentComparison,
  type InvestmentComparisonOptions,
  type PublishedInvestmentPeriod,
  type PublishedInvestmentTotals,
} from '@shared/contracts/dual-forecast/investment-comparison.contract';
import { db } from '../db';
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

export async function readPublishedInvestmentComparison(
  fundId: number,
  options: InvestmentComparisonOptions = {},
  now = new Date()
): Promise<InvestmentComparison | null> {
  const asOfDate = options.asOfDate ?? now.toISOString().slice(0, 10);
  const head = await getTerminalFinancialFactsHead({ fundId });
  if (head.kind === 'none' && Object.keys(options).length === 0) return null;
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
  if (options.baselineSnapshotId && options.baselineStartMonth) {
    try {
      result.baseline = await readForecastInvestmentBaseline(
        fundId,
        options.baselineSnapshotId,
        options.baselineStartMonth,
        asOfDate
      );
      result.baselineReason = result.baseline
        ? null
        : 'The selected saved forecast has no usable investment schedule.';
    } catch {
      result.baselineReason = 'The selected saved forecast could not be validated for this fund.';
    }
  }
  if (head.kind !== 'head') {
    result.reason =
      head.kind === 'none'
        ? 'No published investment facts are available.'
        : 'Published facts lineage is ambiguous or invalid.';
    return InvestmentComparisonSchema.parse(result);
  }
  result.basis = {
    snapshotId: head.row.id,
    snapshotInputHash: head.row.snapshotInputHash,
    snapshotAsOfDate: head.row.asOfDate,
    knowledgeCutoff: head.row.knowledgeCutoff.toISOString(),
  };
  try {
    const parsed = parsePersistedFactsRow(head.row, { allowRestatement: true });
    // Older Round/FMV snapshots are not actuals-pilot investment publications.
    // Preserve their existing forecast lane unless a comparison was requested.
    if (
      parsed.kind === 'facts' &&
      !('capitalActuals' in parsed.snapshot.payload) &&
      Object.keys(options).length === 0
    )
      return null;
    if (parsed.kind !== 'facts' || !('capitalActuals' in parsed.snapshot.payload)) {
      result.reason = 'This publication does not contain supported investment actuals.';
      return InvestmentComparisonSchema.parse(result);
    }
    const snapshot = parsed.snapshot;
    if (snapshot.fundId !== fundId) throw new Error('Published facts fund mismatch');
    result.disclosures.push(
      ...snapshot.payload.cashFlowSeries.warnings.map((warning) => warning.message)
    );
    const points = snapshot.payload.cashFlowSeries.series
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
    const investments = points.map((point): PublishedInvestment => {
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
        effectiveDate: point.effectiveAt.slice(0, 10),
        amount: point.amount,
        category: payload.data.deploymentCategory,
      };
    });
    // An empty investment-only source is not evidence of a zero portfolio.
    if (investments.length === 0) {
      result.reason = 'No investment records were admitted to this publication.';
    } else {
      Object.assign(result, aggregatePublishedInvestments(investments, asOfDate));
      result.status = 'available';
      if (asOfDate > snapshot.asOfDate)
        result.disclosures.push(
          `Published coverage ends on ${snapshot.asOfDate}; later activity is unknown.`
        );
    }
  } catch {
    result.reason =
      'Published investment records could not be reconciled to their immutable facts snapshot.';
  }
  return InvestmentComparisonSchema.parse(result);
}
