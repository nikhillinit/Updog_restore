type PortfolioCompanyStatus = { status?: string | null };

const EXITED_STATUSES = new Set(['exited', 'exit', 'realized', 'realised']);
const WRITTEN_OFF_STATUSES = new Set([
  'written-off',
  'write-off',
  'writtenoff',
  'failed',
  'lost',
  'inactive',
]);

export function normalizePortfolioCompanyStatus(status: string | null | undefined): string {
  return (status ?? 'active')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

export function isExitedPortfolioCompany(company: PortfolioCompanyStatus): boolean {
  return EXITED_STATUSES.has(normalizePortfolioCompanyStatus(company.status));
}

export function isWrittenOffPortfolioCompany(company: PortfolioCompanyStatus): boolean {
  return WRITTEN_OFF_STATUSES.has(normalizePortfolioCompanyStatus(company.status));
}

export function isLivePortfolioCompany(company: PortfolioCompanyStatus): boolean {
  return !isExitedPortfolioCompany(company) && !isWrittenOffPortfolioCompany(company);
}
