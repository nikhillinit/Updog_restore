// PacingEngine.ts

export interface PacingInput {
  fundSize: number;
  deploymentQuarter: number;
  marketCondition: 'bull' | 'bear' | 'neutral';
}

export interface PacingOutput {
  quarter: number;
  deployment: number;
  note: string;
}

export function PacingEngine(input: PacingInput): PacingOutput[] {
  const base = input.fundSize / 12;
  return Array.from({ length: 8 }, (_, i) => ({
    quarter: input.deploymentQuarter + i,
    deployment: base,
    note: `Baseline pacing (${input.marketCondition})`
  }));
}
