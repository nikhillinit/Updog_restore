import type { PacingInput, PacingOutput, PacingSummary } from '@shared/types';
import { PacingInputSchema, PacingOutputSchema } from '@shared/types';
import { PRNG } from '@shared/utils/prng';

const prng = new PRNG(123);

type MarketCondition = PacingInput['marketCondition'];
type MarketAdjustment = {
  early: number;
  mid: number;
  late: number;
};

function validatePacingInput(input: unknown): PacingInput {
  const result = PacingInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid pacing input: ${result.error.message}`);
  }
  return result.data;
}

function validatePacingOutput(output: unknown): PacingOutput {
  const result = PacingOutputSchema.safeParse(output);
  if (!result.success) {
    throw new Error(`Invalid pacing output: ${result.error.message}`);
  }
  return result.data;
}

function isAlgorithmModeEnabled(): boolean {
  return (
    process.env['ALG_PACING']?.toLowerCase() === 'true' || process.env['NODE_ENV'] === 'development'
  );
}

function calculateRuleBasedPacing(input: PacingInput): PacingOutput[] {
  const { fundSize, deploymentQuarter, marketCondition } = input;

  const marketAdjustments: Record<MarketCondition, MarketAdjustment> = {
    bull: { early: 1.3, mid: 1.1, late: 0.8 },
    bear: { early: 0.7, mid: 0.9, late: 1.2 },
    neutral: { early: 1.0, mid: 1.0, late: 1.0 },
  };

  const defaultAdjustment: MarketAdjustment = { early: 1.0, mid: 1.0, late: 1.0 };
  const adjustment = marketAdjustments[marketCondition] ?? defaultAdjustment;
  const baseAmount = fundSize / 8;

  return Array.from({ length: 8 }, (_, index) => {
    const quarter = deploymentQuarter + index;
    let multiplier: number;

    if (index < 3) {
      multiplier = adjustment.early;
    } else if (index < 6) {
      multiplier = adjustment.mid;
    } else {
      multiplier = adjustment.late;
    }

    const variability = 0.9 + prng.next() * 0.2;
    const deployment = baseAmount * multiplier * variability;

    let phaseNote = '';
    if (index < 3) phaseNote = 'early-stage focus';
    else if (index < 6) phaseNote = 'mid-stage deployment';
    else phaseNote = 'late-stage optimization';

    return validatePacingOutput({
      quarter,
      deployment: Math.round(deployment),
      note: `${marketCondition} market pacing (${phaseNote})`,
    });
  });
}

function calculateMLBasedPacing(input: PacingInput): PacingOutput[] {
  const ruleBased = calculateRuleBasedPacing(input);

  return ruleBased.map((item) => {
    const trendAdjustment = 0.85 + prng.next() * 0.3;
    return {
      ...item,
      deployment: Math.round(item.deployment * trendAdjustment),
      note: `ML-optimized pacing (${input.marketCondition} trend analysis)`,
    };
  });
}

export function PacingEngine(input: unknown): PacingOutput[] {
  prng.reset(123);

  const validatedInput = validatePacingInput(input);
  if (isAlgorithmModeEnabled()) {
    return calculateMLBasedPacing(validatedInput);
  }

  return calculateRuleBasedPacing(validatedInput);
}

export function generatePacingSummary(input: PacingInput): PacingSummary {
  const deployments = PacingEngine(input);
  const totalQuarters = deployments.length;
  const totalDeployment = deployments.reduce((sum, deployment) => sum + deployment.deployment, 0);
  const avgQuarterlyDeployment = totalQuarters > 0 ? totalDeployment / totalQuarters : 0;

  return {
    fundSize: input.fundSize,
    totalQuarters,
    avgQuarterlyDeployment: Math.round(avgQuarterlyDeployment),
    marketCondition: input.marketCondition,
    deployments,
    generatedAt: new Date(),
  };
}
