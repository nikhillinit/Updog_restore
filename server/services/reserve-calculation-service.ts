import { db } from '../db';
import { fundSnapshots } from '@shared/schema';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import { isFlagEnabled } from '@shared/flags/getFlag';
import type { ReserveInputTrustSummary } from '@shared/contracts/reserve-input-provenance.contract';
import type { ReserveCompanyInput, ReserveSummary } from '@shared/types';
import Decimal from '@shared/lib/decimal-config';
import { logger } from '../lib/logger';
import { resolveMoicActionability, toH9SnapshotColumns } from './fund-calculation-mode-service';
import {
  getFundMoicRankingSources,
  type FundMoicFactsSource,
  type FundMoicRankingSources,
} from './fund-moic-ranking-service';
import { markCalcRunCompletedIfReady } from './calc-run-tracking';
import { buildReservePortfolioInputWithProvenance } from './reserve-input-builder';
import {
  buildFactsReserveCandidates,
  type FactsReserveCandidate,
} from './reserves/facts-reserve-input-adapter';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RESERVE_FACTS_CALCULATION_KEY = 'reserve_facts_inputs';

type ReserveFactsCalculationMode = 'off' | 'shadow' | 'on';
type FactsBasisMetadata = {
  factsInputHash: string | null;
  trustedForActivation: boolean;
  mode: 'on';
};

async function resolveReserveFactsCalculationMode(
  fundId: number
): Promise<ReserveFactsCalculationMode> {
  const mode = await db.query.fundCalculationModes.findFirst({
    columns: { configuredMode: true, killSwitchActive: true },
    where: (row, { and, eq }) =>
      and(eq(row.fundId, fundId), eq(row.calculationKey, RESERVE_FACTS_CALCULATION_KEY)),
  });
  if (mode?.killSwitchActive) return 'off';
  return mode?.configuredMode === 'shadow' || mode?.configuredMode === 'on'
    ? mode.configuredMode
    : 'off';
}

function eligibleInputs(candidates: readonly FactsReserveCandidate[]): ReserveCompanyInput[] {
  return candidates
    .filter((candidate) => candidate.status === 'eligible')
    .map((candidate) => candidate.input);
}

function engineFedFactsInputsAreTrusted(candidates: readonly FactsReserveCandidate[]): boolean {
  return candidates
    .filter((candidate) => candidate.status === 'eligible')
    .every((candidate) =>
      [
        candidate.input.provenance.invested,
        candidate.input.provenance.ownership,
        candidate.input.provenance.stage,
      ].every((field) => field.status === 'observed' || field.status === 'approved_assumption')
    );
}

function excludedCountsByReason(
  candidates: readonly FactsReserveCandidate[]
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.status !== 'excluded') continue;
    for (const reason of new Set(candidate.reasons)) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

function summaryValueDeltaPct(
  legacySummary: ReserveSummary,
  factsSummary: ReserveSummary
): number | null {
  if (!Number.isFinite(legacySummary.totalAllocation) || legacySummary.totalAllocation === 0) {
    return null;
  }
  return new Decimal(factsSummary.totalAllocation)
    .minus(legacySummary.totalAllocation)
    .div(new Decimal(legacySummary.totalAllocation).abs())
    .toDecimalPlaces(6)
    .toNumber();
}

function logReserveFactsShadowEvent(event: Record<string, unknown>): void {
  try {
    logger.info(event, 'reserve facts inputs shadow comparison generated');
  } catch {
    return;
  }
}

async function emitReserveFactsShadowComparison(input: {
  fundId: number;
  asOfDate: string;
  factsSource: FundMoicFactsSource;
  legacyCompanyCount: number;
  legacySummary: ReserveSummary;
}): Promise<void> {
  const startedAt = performance.now();
  try {
    const facts = await buildFactsReserveCandidates({
      fundId: input.fundId,
      asOfDate: input.asOfDate,
      factsSource: input.factsSource,
    });
    const factsPortfolio = eligibleInputs(facts.candidates);
    const factsSummary = generateReserveSummary(input.fundId, factsPortfolio);
    const excludedCounts = excludedCountsByReason(facts.candidates);
    logReserveFactsShadowEvent({
      eventName: 'reserve_facts_inputs_shadow',
      fundId: input.fundId,
      factsInputHash: facts.factsInputHash?.slice(0, 12) ?? null,
      eligibleCount: factsPortfolio.length,
      excludedCountsByReason: excludedCounts,
      legacyCompanyCount: input.legacyCompanyCount,
      summaryValueDeltaPct: summaryValueDeltaPct(input.legacySummary, factsSummary),
      durationMs: performance.now() - startedAt,
      warningCodes: Object.keys(excludedCounts).map((reason) => reason.toUpperCase()),
    });
  } catch {
    logReserveFactsShadowEvent({
      eventName: 'reserve_facts_inputs_shadow',
      fundId: input.fundId,
      factsInputHash: null,
      eligibleCount: 0,
      excludedCountsByReason: {},
      legacyCompanyCount: input.legacyCompanyCount,
      summaryValueDeltaPct: null,
      durationMs: performance.now() - startedAt,
      warningCodes: ['SHADOW_BUILD_FAILED'],
    });
  }
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

export interface ReserveCalculationInput {
  fundId: number;
  correlationId: string;
  runId?: number;
  configId?: number;
  configVersion?: number;
}

export async function runReserveCalculation({
  fundId,
  correlationId,
  runId,
  configId,
  configVersion,
}: ReserveCalculationInput) {
  const startTime = performance.now();

  const fundConfig = await retryWithBackoff(() =>
    db.query.fundConfigs.findFirst({
      where: (configs, { eq, and }) =>
        and(eq(configs.fundId, fundId), eq(configs.isPublished, true)),
      orderBy: (configs, { desc }) => desc(configs.version),
    })
  );

  const fund = await retryWithBackoff(() =>
    db.query.funds.findFirst({
      where: (funds, { eq }) => eq(funds.id, fundId),
    })
  );

  if (!fund && !fundConfig) {
    throw new Error(`Fund ${fundId} not found`);
  }

  const reserveFactsFlagEnabled = isFlagEnabled('enable_facts_sourced_reserve_inputs');
  const reserveFactsMode = reserveFactsFlagEnabled
    ? await resolveReserveFactsCalculationMode(fundId)
    : 'off';
  let portfolio: ReserveCompanyInput[];
  let reserveInputTrustSummary: ReserveInputTrustSummary;
  let factsBasis: FactsBasisMetadata | undefined;
  let factsInputsTrustedForActivation = true;
  let moicSources: FundMoicRankingSources | undefined;
  let factsAsOfDate: string | undefined;

  if (reserveFactsMode === 'on') {
    const factsNow = new Date();
    factsAsOfDate = factsNow.toISOString().slice(0, 10);
    moicSources = await getFundMoicRankingSources(fundId, db, undefined, factsNow);
    const facts = await buildFactsReserveCandidates({
      fundId,
      asOfDate: factsAsOfDate,
      factsSource: moicSources.factsSource,
    });
    portfolio = eligibleInputs(facts.candidates);
    reserveInputTrustSummary = facts.trustSummary;
    factsInputsTrustedForActivation =
      facts.factsInputHash !== null &&
      facts.trustSummary.trustedForActivation &&
      engineFedFactsInputsAreTrusted(facts.candidates);
    factsBasis = {
      factsInputHash: facts.factsInputHash,
      trustedForActivation: factsInputsTrustedForActivation,
      mode: 'on',
    };
  } else {
    const legacy = await retryWithBackoff(() => buildReservePortfolioInputWithProvenance(fundId));
    portfolio = legacy.portfolio;
    reserveInputTrustSummary = legacy.reserveInputTrustSummary;
  }

  const reserves = generateReserveSummary(fundId, portfolio);
  if (reserveFactsMode === 'shadow') {
    const factsNow = new Date();
    factsAsOfDate = factsNow.toISOString().slice(0, 10);
    moicSources = await getFundMoicRankingSources(fundId, db, undefined, factsNow);
  }
  // H9: stamp the actionability fingerprint onto the authoritative snapshot so
  // downstream reuse/cache/export can gate on it. Display reads are unaffected.
  const actionability = await resolveMoicActionability({
    fundId,
    ...(moicSources !== undefined && { sources: moicSources }),
  });
  const h9Columns = toH9SnapshotColumns(actionability);
  if (reserveFactsMode === 'on' && !factsInputsTrustedForActivation) {
    h9Columns.h9ActionabilityStatus = 'non_actionable';
  }

  // ADR-022: authoritative-only writer. scenario_set_id intentionally omitted (defaults to NULL).
  const insertedSnapshots = await db
    .insert(fundSnapshots)
    .values({
      fundId,
      type: 'RESERVE',
      payload: reserves as unknown as Record<string, unknown>,
      calcVersion: process.env['ALG_RESERVE_VERSION'] ?? '1.0.0',
      correlationId,
      snapshotTime: new Date(),
      ...(runId != null && { runId }),
      ...(configId != null && { configId }),
      ...(configVersion != null && { configVersion }),
      ...h9Columns,
      metadata: {
        portfolioCount: portfolio.length,
        engineRuntime: performance.now() - startTime,
        reserveInputTrustSummary,
        ...(factsBasis !== undefined && { factsBasis }),
      },
    })
    .returning();

  const snapshot = insertedSnapshots[0];
  if (!snapshot) {
    throw new Error(`Failed to persist reserve snapshot for fund ${fundId}`);
  }

  if (runId != null) {
    await markCalcRunCompletedIfReady(runId);
  }

  if (reserveFactsMode === 'shadow' && moicSources !== undefined && factsAsOfDate !== undefined) {
    await emitReserveFactsShadowComparison({
      fundId,
      asOfDate: factsAsOfDate,
      factsSource: moicSources.factsSource,
      legacyCompanyCount: portfolio.length,
      legacySummary: reserves,
    });
  }

  return {
    fundId,
    snapshotId: snapshot.id,
    reserves,
    calculatedAt: snapshot.createdAt,
    version: snapshot.calcVersion,
  };
}
