/**
 * LP Reporting -- Metrics Engine (Phase 1.2).
 *
 * Pure function that produces the locked Phase 1.1 metric-run results
 * (LpMetricRunResults) and diagnostics (LpMetricRunDiagnostics) from
 * already-parsed cash flow events and valuation marks.
 *
 * NO database, NO network, NO filesystem.  All money math via Decimal.js;
 * money on the wire as decimal strings (ADR-011, 6 decimal places at rest
 * to match NUMERIC(20,6)).  XIRR via xirr-diagnostic-service.
 *
 * @module server/services/lp-reporting/metrics-engine
 * @see docs/adr/ADR-010-xirr-day-count-and-bounds.md
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { createHash } from 'node:crypto';

import { Decimal } from '@shared/lib/decimal-config';
import type { CashFlow } from '@shared/lib/finance/xirr';
import type {
  LpMetricRunDiagnostics,
  LpMetricRunResults,
  MarkConfidenceMix,
  XirrDiagnostic,
} from '@shared/contracts/lp-reporting';

import { xirrDiagnostic } from './xirr-diagnostic-service';

const ENGINE_VERSION = '1.0.0';
const DECIMAL_PRECISION = 6;

// ============================================================================
// INPUT / OUTPUT TYPES
// ============================================================================

export type CashFlowEventType =
  | 'lp_capital_call'
  | 'lp_distribution'
  | 'portfolio_investment'
  | 'realized_proceeds'
  | 'fund_expense'
  | 'recallable_distribution'
  | 'reversal';

export type CashFlowPerspectiveLite = 'lp_net' | 'fund_gross' | 'vehicle' | 'company';

export type EventStatus = 'draft' | 'approved' | 'locked' | 'reversed';

export type MarkStatus = 'draft' | 'approved' | 'locked' | 'superseded' | 'reversed';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type MetricsPerspective = 'lp_net' | 'fund_gross';

export interface ParsedCashFlowEvent {
  id: number;
  eventType: CashFlowEventType;
  /** Decimal string (matches DecimalStringSchema regex). */
  amount: string;
  /** ISO date or datetime; only the calendar day is used by the engine. */
  eventDate: string;
  perspective: CashFlowPerspectiveLite;
  status?: EventStatus;
  reversalOfEventId?: number | null;
}

export interface ParsedValuationMark {
  id: number;
  /** Decimal string (matches DecimalStringSchema regex). */
  fairValue: string;
  /** ISO date YYYY-MM-DD. */
  markDate: string;
  /** ISO date YYYY-MM-DD. */
  asOfDate: string;
  status?: MarkStatus;
  confidenceLevel: ConfidenceLevel;
  /**
   * Optional company key; engine prefers same-company most-recent semantics
   * when present.  When omitted we fall back to mark id (one mark = one
   * portfolio position).  See note in selectActiveMarks().
   */
  companyId?: number;
}

export interface ComputeMetricsInput {
  fundId: number;
  /** ISO date YYYY-MM-DD. */
  asOfDate: string;
  perspective: MetricsPerspective;
  cashFlowEvents: ParsedCashFlowEvent[];
  valuationMarks: ParsedValuationMark[];
}

export interface ComputeMetricsOutput {
  results: LpMetricRunResults;
  diagnostics: LpMetricRunDiagnostics;
  /** SHA-256 hex of request fields plus metric-relevant source-row fingerprints. */
  inputsHash: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const REVERSED_EVENT_STATUS = new Set<EventStatus>(['reversed']);
const EXCLUDED_MARK_STATUS = new Set<MarkStatus>(['superseded', 'reversed']);

/**
 * Render a Decimal as a fixed-precision decimal string at engine precision
 * (6 dp).  Mirrors the toFixed(6) calls used in import-reconciliation-service.
 */
function decToString(value: Decimal): string {
  return value.toFixed(DECIMAL_PRECISION);
}

/**
 * Calendar-day comparison.  All event/mark dates in this engine are
 * compared as ISO date strings (YYYY-MM-DD), which is lexicographically
 * date-ordered.  We slice to 10 chars to be tolerant of full ISO datetimes.
 */
function isoDay(value: string): string {
  return value.slice(0, 10);
}

function isLiveEvent(event: ParsedCashFlowEvent): boolean {
  if (event.status && REVERSED_EVENT_STATUS.has(event.status)) {
    return false;
  }
  if (event.eventType === 'reversal') {
    // Reversal rows are bookkeeping markers that null out an upstream event;
    // they should not contribute to either side of the metric math.
    return false;
  }
  return true;
}

/**
 * Sum all amounts (treated as absolute magnitudes via Decimal) across the
 * given event types.  Magnitudes are taken so the caller controls sign
 * (e.g. capital calls = +contribution, recallable_distribution = -contribution).
 */
function sumAmountsByType(
  events: ParsedCashFlowEvent[],
  types: ReadonlySet<CashFlowEventType>
): Decimal {
  return events
    .filter((e) => isLiveEvent(e) && types.has(e.eventType))
    .reduce((acc, e) => acc.plus(new Decimal(e.amount).abs()), new Decimal(0));
}

/**
 * Select the marks that contribute to currentNav at asOfDate:
 *   - markDate <= asOfDate (future-dated marks excluded)
 *   - status NOT IN (superseded, reversed)
 *   - one mark per company (or per mark id when companyId is absent);
 *     pick the most recent markDate <= asOfDate.
 *
 * Returns { active: chosen marks, excludedFutureMarkIds }.
 */
function selectActiveMarks(
  marks: ParsedValuationMark[],
  asOfDate: string
): {
  active: ParsedValuationMark[];
  excludedFutureMarkIds: number[];
} {
  const asOfDay = isoDay(asOfDate);
  const excludedFutureMarkIds: number[] = [];

  // Step 1: drop future-dated marks (regardless of status).  They are
  // surfaced in diagnostics so reviewers can see them.
  const onOrBefore: ParsedValuationMark[] = [];
  for (const m of marks) {
    if (isoDay(m.markDate) > asOfDay) {
      excludedFutureMarkIds.push(m.id);
    } else {
      onOrBefore.push(m);
    }
  }

  // Step 2: drop marks whose status excludes them from the live set.
  const live = onOrBefore.filter((m) => !(m.status && EXCLUDED_MARK_STATUS.has(m.status)));

  // Step 3: deduplicate by companyId (or by id when companyId is absent),
  // keeping the most recent markDate.
  const byKey = new Map<string, ParsedValuationMark>();
  for (const m of live) {
    const key = m.companyId !== undefined ? `c:${m.companyId}` : `m:${m.id}`;
    const existing = byKey.get(key);
    if (!existing || isoDay(m.markDate) > isoDay(existing.markDate)) {
      byKey.set(key, m);
    }
  }

  return {
    active: Array.from(byKey.values()),
    excludedFutureMarkIds,
  };
}

function tallyConfidence(activeMarks: ParsedValuationMark[]): MarkConfidenceMix {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const m of activeMarks) {
    if (m.confidenceLevel === 'high') high += 1;
    else if (m.confidenceLevel === 'medium') medium += 1;
    else low += 1;
  }
  return { high, medium, low };
}

/**
 * Convert a decimal-string amount to a JS number safely for the XIRR
 * solver.  Decimal.js -> number is lossy beyond ~15 sig figs but XIRR
 * itself runs in float; this is consistent with shared/lib/finance/xirr.ts.
 */
function amountAsNumber(amount: string, sign: 1 | -1): number {
  return new Decimal(amount).times(sign).toNumber();
}

/**
 * Build LP-net cash flows for IRR:
 *   - lp_capital_call -> outflow (negative)
 *   - lp_distribution -> inflow (positive)
 *   - synthetic terminal at asOfDate of +currentNav (if > 0)
 */
function buildNetIrrFlows(
  events: ParsedCashFlowEvent[],
  asOfDate: string,
  currentNav: Decimal
): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const e of events) {
    if (!isLiveEvent(e)) continue;
    if (e.eventType === 'lp_capital_call') {
      flows.push({ date: new Date(e.eventDate), amount: amountAsNumber(e.amount, -1) });
    } else if (e.eventType === 'lp_distribution') {
      flows.push({ date: new Date(e.eventDate), amount: amountAsNumber(e.amount, 1) });
    }
  }
  if (currentNav.gt(0)) {
    flows.push({ date: new Date(asOfDate), amount: currentNav.toNumber() });
  }
  return flows;
}

/**
 * Build fund-gross cash flows for IRR:
 *   - LP-net flows above, plus
 *   - portfolio_investment -> outflow (negative)
 *   - realized_proceeds -> inflow (positive)
 */
function buildGrossIrrFlows(
  events: ParsedCashFlowEvent[],
  asOfDate: string,
  currentNav: Decimal
): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const e of events) {
    if (!isLiveEvent(e)) continue;
    switch (e.eventType) {
      case 'lp_capital_call':
      case 'portfolio_investment':
        flows.push({ date: new Date(e.eventDate), amount: amountAsNumber(e.amount, -1) });
        break;
      case 'lp_distribution':
      case 'realized_proceeds':
        flows.push({ date: new Date(e.eventDate), amount: amountAsNumber(e.amount, 1) });
        break;
      default:
        break;
    }
  }
  if (currentNav.gt(0)) {
    flows.push({ date: new Date(asOfDate), amount: currentNav.toNumber() });
  }
  return flows;
}

function computeInputsHash(input: ComputeMetricsInput): string {
  const eventFingerprints = input.cashFlowEvents
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      amount: event.amount,
      eventDate: isoDay(event.eventDate),
      perspective: event.perspective,
      status: event.status ?? null,
      reversalOfEventId: event.reversalOfEventId ?? null,
    }))
    .sort((a, b) => a.id - b.id);
  const markFingerprints = input.valuationMarks
    .map((mark) => ({
      id: mark.id,
      fairValue: mark.fairValue,
      markDate: isoDay(mark.markDate),
      asOfDate: isoDay(mark.asOfDate),
      status: mark.status ?? null,
      confidenceLevel: mark.confidenceLevel,
      companyId: mark.companyId ?? null,
    }))
    .sort((a, b) => a.id - b.id);
  const payload = JSON.stringify({
    fundId: input.fundId,
    eventFingerprints,
    markFingerprints,
    asOfDate: input.asOfDate,
    perspective: input.perspective,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Render an IRR diagnostic's irr value as a 6 dp decimal string, or null
 * when the diagnostic did not produce a usable rate.
 */
function irrToDecimalString(diag: XirrDiagnostic, irr: number | null): string | null {
  if (irr === null) return null;
  if (diag.convergence === 'failed') return null;
  if (!Number.isFinite(irr)) return null;
  return new Decimal(irr).toFixed(DECIMAL_PRECISION);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Compute LP-reporting metrics for a fund as of asOfDate.
 *
 * Pure function: same input -> same output, no side effects, no IO.
 *
 * The `perspective` field on the input controls which top-level
 * netIrr/grossIrr field is treated as authoritative for downstream
 * consumers, but BOTH `xirrDiagnostic.net` and `xirrDiagnostic.gross`
 * are always populated (the contract requires both).
 */
export function computeMetrics(input: ComputeMetricsInput): ComputeMetricsOutput {
  const warnings: { code: string; message: string }[] = [];

  // ---- Contributions and distributions (Decimal) ----
  const calledCapital = sumAmountsByType(
    input.cashFlowEvents,
    new Set<CashFlowEventType>(['lp_capital_call'])
  );
  const recallable = sumAmountsByType(
    input.cashFlowEvents,
    new Set<CashFlowEventType>(['recallable_distribution'])
  );
  const contributions = calledCapital.minus(recallable);

  const distributions = sumAmountsByType(
    input.cashFlowEvents,
    new Set<CashFlowEventType>(['lp_distribution', 'realized_proceeds'])
  );

  // ---- NAV (active marks at asOfDate) ----
  const { active, excludedFutureMarkIds } = selectActiveMarks(input.valuationMarks, input.asOfDate);
  const currentNav = active.reduce((acc, m) => acc.plus(new Decimal(m.fairValue)), new Decimal(0));
  const markConfidenceMix = tallyConfidence(active);

  // ---- Ratios (null when contributions are zero) ----
  let dpi: string | null = null;
  let rvpi: string | null = null;
  let tvpi: string | null = null;
  let moic: string | null = null;

  if (contributions.isZero()) {
    warnings.push({
      code: 'ZERO_CONTRIBUTIONS',
      message: 'Net contributions are zero; DPI / RVPI / TVPI / MOIC are undefined for this run.',
    });
  } else {
    const dpiD = distributions.dividedBy(contributions);
    const rvpiD = currentNav.dividedBy(contributions);
    const tvpiD = dpiD.plus(rvpiD);
    const moicD = distributions.plus(currentNav).dividedBy(contributions);
    dpi = decToString(dpiD);
    rvpi = decToString(rvpiD);
    tvpi = decToString(tvpiD);
    moic = decToString(moicD);
  }

  // ---- IRRs (always run both flow constructions) ----
  const netFlows = buildNetIrrFlows(input.cashFlowEvents, input.asOfDate, currentNav);
  const grossFlows = buildGrossIrrFlows(input.cashFlowEvents, input.asOfDate, currentNav);
  const netResult = xirrDiagnostic(netFlows);
  const grossResult = xirrDiagnostic(grossFlows);

  const netIrr = irrToDecimalString(netResult.diagnostic, netResult.irr);
  const grossIrr = irrToDecimalString(grossResult.diagnostic, grossResult.irr);

  // ---- Assemble contract-shaped outputs ----
  const results: LpMetricRunResults = {
    asOfDate: isoDay(input.asOfDate),
    currency: 'USD',
    dpi,
    rvpi,
    tvpi,
    moic,
    netIrr,
    grossIrr,
    xirrDiagnostic: {
      net: netResult.diagnostic,
      gross: grossResult.diagnostic,
    },
    contributionsTotal: decToString(contributions),
    distributionsTotal: decToString(distributions),
    currentNav: decToString(currentNav),
    markConfidenceMix,
  };

  const diagnostics: LpMetricRunDiagnostics = {
    engineVersion: ENGINE_VERSION,
    decimalPrecision: DECIMAL_PRECISION,
    excludedFutureMarks: excludedFutureMarkIds,
    warnings,
  };

  return {
    results,
    diagnostics,
    inputsHash: computeInputsHash(input),
  };
}
