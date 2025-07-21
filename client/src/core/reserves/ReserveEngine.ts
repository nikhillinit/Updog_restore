// ReserveEngine.ts

export interface ReserveInput {
  id: number;
  invested: number;
  ownership: number;
  stage: string;
  sector: string;
}

export interface ReserveOutput {
  allocation: number;
  confidence: number;
  rationale: string;
}

export function ReserveEngine(portfolio: ReserveInput[]): ReserveOutput[] {
  return portfolio.map((company) => ({
    allocation: company.invested * 2, // Placeholder rule
    confidence: 0.3,                   // Low by default
    rationale: "Rule-based allocation (cold-start mode)"
  }));
}
