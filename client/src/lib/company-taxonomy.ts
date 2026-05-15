export const COMPANY_SECTORS = [
  'AI / ML',
  'FinTech',
  'SaaS',
  'HealthTech',
  'ClimateTech',
  'Cybersecurity',
  'Developer Tools',
  'Enterprise Software',
  'Marketplace',
  'Consumer',
  'Infrastructure',
  'Other',
] as const;

export const COMPANY_STAGES = [
  'Pre-seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Growth',
  'Late Stage',
] as const;

export type CompanySector = (typeof COMPANY_SECTORS)[number];
export type CompanyStage = (typeof COMPANY_STAGES)[number];

function isOption<T extends string>(options: readonly T[], value: string): value is T {
  return options.some((option) => option === value);
}

export function isCompanySector(value: string): value is CompanySector {
  return isOption(COMPANY_SECTORS, value);
}

export function isCompanyStage(value: string): value is CompanyStage {
  return isOption(COMPANY_STAGES, value);
}
