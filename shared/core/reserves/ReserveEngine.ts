/* eslint-disable povc-security/no-floating-point-in-core -- PLAN_61 Task 2 P10: pre-existing baseline debt in ADR-056 reserve engine; Decimal refactor pending */
import type { ReserveCompanyInput, ReserveOutput, ReserveSummary } from '@shared/types';
import { ConfidenceLevel, ReserveCompanyInputSchema, ReserveOutputSchema } from '@shared/types';
import { PRNG } from '@shared/utils/prng';
import { createCalculationContext } from '../calc-substrate';
import { runReserveWithSubstrate, type ReserveAlgorithm } from './reserve-substrate-adapter';

const prng = new PRNG(42);

function isAlgorithmModeEnabled(): boolean {
  return (
    process.env['ALG_RESERVE']?.toLowerCase() === 'true' ||
    process.env['NODE_ENV'] === 'development'
  );
}

function validateReserveInput(input: unknown): ReserveCompanyInput {
  const result = ReserveCompanyInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid reserve input: ${result.error.message}`);
  }
  return result.data;
}

function validateReserveOutput(output: unknown): ReserveOutput {
  const result = ReserveOutputSchema.safeParse(output);
  if (!result.success) {
    throw new Error(`Invalid reserve output: ${result.error.message}`);
  }
  return result.data;
}

function calculateRuleBasedAllocation(company: ReserveCompanyInput): ReserveOutput {
  const { invested, stage, sector, ownership } = company;

  const stageMultipliers: Record<string, number> = {
    Seed: 1.5,
    'Series A': 2.0,
    'Series B': 2.5,
    'Series C': 1.8,
    Growth: 1.2,
  };

  const sectorMultipliers: Record<string, number> = {
    SaaS: 1.1,
    Fintech: 1.2,
    Healthcare: 1.3,
    Analytics: 1.0,
    Infrastructure: 0.9,
    Enterprise: 0.8,
  };

  const stageMultiplier = stageMultipliers[stage] || 2.0;
  const sectorMultiplier = sectorMultipliers[sector] || 1.0;

  let allocation = invested * stageMultiplier * sectorMultiplier;

  if (ownership > 0.1) {
    allocation *= 1.2;
  } else if (ownership < 0.05) {
    allocation *= 0.8;
  }

  let confidence: number = ConfidenceLevel.COLD_START;
  if (stage && sector) confidence += 0.2;
  if (ownership > 0) confidence += 0.15;
  if (invested > 1_000_000) confidence += 0.1;
  confidence = Math.min(confidence, ConfidenceLevel.MEDIUM);

  let rationale = `${stage} stage, ${sector} sector`;
  if (confidence <= ConfidenceLevel.LOW) {
    rationale += ' (cold-start mode)';
  } else {
    rationale += ' (enhanced rules)';
  }

  return validateReserveOutput({
    allocation: Math.round(allocation),
    confidence: Math.round(confidence * 100) / 100,
    rationale,
  });
}

function calculateMLBasedAllocation(company: ReserveCompanyInput): ReserveOutput {
  const baseAllocation = calculateRuleBasedAllocation(company);
  const mlAdjustment = 0.8 + prng.next() * 0.4;

  return validateReserveOutput({
    allocation: Math.round(baseAllocation.allocation * mlAdjustment),
    confidence: Math.min(ConfidenceLevel.ML_ENHANCED, baseAllocation.confidence + 0.3),
    rationale: `ML-enhanced allocation (${baseAllocation.rationale.replace('(cold-start mode)', '').replace('(enhanced rules)', '').trim()})`,
  });
}

export function ReserveEngine(portfolio: unknown[], algorithm?: ReserveAlgorithm): ReserveOutput[] {
  prng.reset(42);

  if (!Array.isArray(portfolio) || portfolio.length === 0) {
    return [];
  }

  const validatedPortfolio = portfolio.map((company, index) => {
    try {
      return validateReserveInput(company);
    } catch (error) {
      throw new Error(
        `Invalid company data at index ${index}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  const useAlgorithm = algorithm === undefined ? isAlgorithmModeEnabled() : algorithm === 'ml';

  return validatedPortfolio.map((company) => {
    if (useAlgorithm && prng.next() > 0.3) {
      return calculateMLBasedAllocation(company);
    }

    return calculateRuleBasedAllocation(company);
  });
}

export function generateReserveSummary(
  fundId: number,
  portfolio: ReserveCompanyInput[],
  algorithm: ReserveAlgorithm = 'rule-based'
): ReserveSummary {
  const ctx = createCalculationContext({
    calculationKey: 'reserve',
    seed: 42,
    asOf: new Date().toISOString(),
  });
  const result = runReserveWithSubstrate(ctx, portfolio, {
    configuredMode: 'on',
    killSwitchActive: false,
    algorithm,
  });
  if (result.state !== 'available') {
    throw new Error(`Reserve calculation unavailable: ${result.reasonCodes.join(', ')}`);
  }
  return {
    fundId,
    totalAllocation: Number(result.value.totalAllocation),
    avgConfidence: Number(result.value.avgConfidence),
    highConfidenceCount: result.value.highConfidenceCount,
    allocations: result.value.allocations.map((entry) => ({
      allocation: Number(entry.allocation),
      confidence: Number(entry.confidence),
      rationale: entry.rationale,
    })),
    generatedAt: new Date(result.value.asOfUtc),
    basis: result.basis,
    resultHash: result.resultHash,
  };
}
