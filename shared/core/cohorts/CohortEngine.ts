import type { CohortInput, CohortOutput, CohortSummary } from '@shared/types';
import { CohortInputSchema, CohortOutputSchema } from '@shared/types';

function isAlgorithmModeEnabled(): boolean {
  return (
    process.env['ALG_COHORT']?.toLowerCase() === 'true' || process.env['NODE_ENV'] === 'development'
  );
}

function validateCohortInput(input: unknown): CohortInput {
  const result = CohortInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid cohort input: ${result.error.message}`);
  }
  return result.data;
}

function validateCohortOutput(output: unknown): CohortOutput {
  const result = CohortOutputSchema.safeParse(output);
  if (!result.success) {
    throw new Error(`Invalid cohort output: ${result.error.message}`);
  }
  return result.data;
}

function generateMockCompanies(cohortSize: number) {
  const stages = ['Seed', 'Series A', 'Series B', 'Series C'];
  const companyPrefixes = ['Tech', 'Data', 'Cloud', 'Smart', 'Digital', 'Next'];
  const companySuffixes = ['Corp', 'Inc', 'Labs', 'Systems', 'Solutions', 'Technologies'];

  return Array.from({ length: cohortSize }, (_, index) => {
    const baseValuation = 1_000_000 + Math.random() * 50_000_000;
    const growthFactor = Math.pow(1.5, Math.random() * 3);

    return {
      id: index + 1,
      name: `${companyPrefixes[Math.floor(Math.random() * companyPrefixes.length)]}${companySuffixes[Math.floor(Math.random() * companySuffixes.length)]}`,
      stage: stages[Math.floor(Math.random() * stages.length)] ?? 'Seed',
      valuation: Math.round(baseValuation * growthFactor),
    };
  });
}

function calculateRuleBasedCohortMetrics(input: CohortInput): CohortOutput {
  const { fundId, vintageYear, cohortSize } = input;
  const cohortId = `cohort-${fundId}-${vintageYear}`;
  const companies = generateMockCompanies(cohortSize);
  const yearsActive = new Date().getFullYear() - vintageYear;
  const maturityFactor = Math.min(yearsActive / 5, 1);

  let baseIRR = 0.15;
  const vintageAdjustments: Record<number, number> = {
    2020: -0.05,
    2021: 0.08,
    2022: -0.03,
    2023: 0.02,
    2024: 0.05,
  };

  baseIRR += vintageAdjustments[vintageYear] || 0;
  baseIRR *= maturityFactor;

  const baseMultiple = 1.0 + baseIRR * yearsActive;
  const multiple = Math.max(1.0, baseMultiple + (Math.random() * 0.5 - 0.25));
  const dpi = Math.max(0, multiple * maturityFactor * 0.4);

  return validateCohortOutput({
    cohortId,
    vintageYear,
    performance: {
      irr: Math.round(baseIRR * 10000) / 10000,
      multiple: Math.round(multiple * 100) / 100,
      dpi: Math.round(dpi * 100) / 100,
    },
    companies,
  });
}

function calculateMLBasedCohortMetrics(input: CohortInput): CohortOutput {
  const baseOutput = calculateRuleBasedCohortMetrics(input);
  const mlAdjustment = 0.9 + Math.random() * 0.2;

  return validateCohortOutput({
    ...baseOutput,
    performance: {
      irr: Math.round(baseOutput.performance.irr * mlAdjustment * 10000) / 10000,
      multiple: Math.round(baseOutput.performance.multiple * mlAdjustment * 100) / 100,
      dpi: Math.round(baseOutput.performance.dpi * mlAdjustment * 100) / 100,
    },
    companies: baseOutput.companies.map((company) => ({
      ...company,
      valuation: Math.round(company.valuation * mlAdjustment),
    })),
  });
}

export function CohortEngine(input: unknown): CohortOutput {
  const validatedInput = validateCohortInput(input);
  if (isAlgorithmModeEnabled()) {
    return calculateMLBasedCohortMetrics(validatedInput);
  }

  return calculateRuleBasedCohortMetrics(validatedInput);
}

export function generateCohortSummary(input: CohortInput): CohortSummary {
  const cohortOutput = CohortEngine(input);
  const totalCompanies = cohortOutput.companies.length;
  const avgValuation =
    totalCompanies > 0
      ? cohortOutput.companies.reduce((sum, company) => sum + company.valuation, 0) / totalCompanies
      : 0;

  const stageDistribution = cohortOutput.companies.reduce(
    (acc, company) => {
      acc[company.stage] = (acc[company.stage] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    cohortId: cohortOutput.cohortId,
    vintageYear: cohortOutput.vintageYear,
    totalCompanies,
    performance: cohortOutput.performance,
    avgValuation: Math.round(avgValuation),
    stageDistribution,
    companies: cohortOutput.companies,
    generatedAt: new Date(),
    metadata: {
      algorithmMode: isAlgorithmModeEnabled() ? 'ml-enhanced' : 'rule-based',
      yearsActive: new Date().getFullYear() - cohortOutput.vintageYear,
      maturityLevel: Math.min((new Date().getFullYear() - cohortOutput.vintageYear) / 5, 1),
    },
  };
}

export function compareCohorts(cohorts: CohortInput[]): {
  cohorts: CohortSummary[];
  comparison: {
    bestPerforming: string;
    avgIRR: number;
    avgMultiple: number;
    totalCompanies: number;
  };
} {
  if (cohorts.length === 0) {
    throw new Error('At least one cohort required for comparison');
  }

  const cohortSummaries = cohorts.map(generateCohortSummary);
  const bestPerforming = cohortSummaries
    .slice(1)
    .reduce(
      (best, current) => (current.performance.irr > best.performance.irr ? current : best),
      cohortSummaries[0]!
    );

  const avgIRR =
    cohortSummaries.reduce((sum, cohort) => sum + cohort.performance.irr, 0) /
    cohortSummaries.length;
  const avgMultiple =
    cohortSummaries.reduce((sum, cohort) => sum + cohort.performance.multiple, 0) /
    cohortSummaries.length;
  const totalCompanies = cohortSummaries.reduce((sum, cohort) => sum + cohort.totalCompanies, 0);

  return {
    cohorts: cohortSummaries,
    comparison: {
      bestPerforming: bestPerforming.cohortId,
      avgIRR: Math.round(avgIRR * 10000) / 10000,
      avgMultiple: Math.round(avgMultiple * 100) / 100,
      totalCompanies,
    },
  };
}
