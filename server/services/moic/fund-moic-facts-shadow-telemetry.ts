import type { FundMoicRankingSources } from '../fund-moic-ranking-service';
import { logger } from '../../lib/logger';

export interface FundMoicFactsShadowTelemetryEvent {
  fundId: number;
  factsInputHash: string | null;
  companyCount: number;
  actionableCount: number;
  indicativeCount: number;
  notActionableCount: number;
  legacyTopCompanyId: number | null;
  factsEligibleTopCompanyId: number | null;
  topNOverlap: number;
  defaultedExitProbabilityCount: number;
  defaultedReserveExitMultipleCount: number;
  currencyBlockedCount: number;
  durationMs: number;
}

export interface FundMoicFactsShadowLogger {
  info(bindings: FundMoicFactsShadowTelemetryEvent, message: string): void;
}

function positiveCompanyId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const companyId = Number.parseInt(value, 10);
  return Number.isSafeInteger(companyId) ? companyId : null;
}

export function buildFundMoicFactsShadowTelemetryEvent(input: {
  fundId: number;
  factsInputHash: string | null;
  sources: FundMoicRankingSources;
  durationMs: number;
}): FundMoicFactsShadowTelemetryEvent {
  const basisByInvestmentId = input.sources.factsBasisByInvestmentId;
  const rankingBasis = input.sources.legacy.rankings.map((ranking) => ({
    companyId: positiveCompanyId(ranking.investmentId),
    basis: basisByInvestmentId?.get(ranking.investmentId) ?? null,
  }));
  const actionable = rankingBasis.filter((item) => item.basis?.rankability === 'actionable');
  const legacyTopCompanyIds = rankingBasis
    .slice(0, 5)
    .map((item) => item.companyId)
    .filter((companyId): companyId is number => companyId !== null);
  const factsEligibleTopCompanyIds = actionable
    .map((item) => item.companyId)
    .filter((companyId): companyId is number => companyId !== null)
    .slice(0, 5);
  const eligibleTopSet = new Set(factsEligibleTopCompanyIds);

  return {
    fundId: input.fundId,
    factsInputHash: input.factsInputHash?.slice(0, 12) ?? null,
    companyCount: input.sources.legacy.provenance.sourceRecordCount,
    actionableCount: actionable.length,
    indicativeCount: rankingBasis.filter((item) => item.basis?.rankability === 'indicative').length,
    notActionableCount: rankingBasis.filter((item) => item.basis?.rankability === 'not_actionable')
      .length,
    legacyTopCompanyId: rankingBasis[0]?.companyId ?? null,
    factsEligibleTopCompanyId: factsEligibleTopCompanyIds[0] ?? null,
    topNOverlap: legacyTopCompanyIds.filter((companyId) => eligibleTopSet.has(companyId)).length,
    defaultedExitProbabilityCount: input.sources.moicInputSummary.defaultedExitProbabilityCount,
    defaultedReserveExitMultipleCount:
      input.sources.moicInputSummary.defaultedReserveExitMultipleCount,
    currencyBlockedCount: rankingBasis.filter((item) =>
      item.basis?.reasons.includes('currency_blocked')
    ).length,
    durationMs: input.durationMs,
  };
}

export function emitFundMoicFactsShadowTelemetry(
  input: Parameters<typeof buildFundMoicFactsShadowTelemetryEvent>[0],
  log: FundMoicFactsShadowLogger = logger
): void {
  try {
    log.info(
      buildFundMoicFactsShadowTelemetryEvent(input),
      'fund-moic facts-basis shadow comparison generated'
    );
  } catch {
    return;
  }
}
