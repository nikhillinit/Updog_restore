import type { Request, Response } from 'express';

import { storage } from '../../storage';

import { getVerifiedFundScope } from './provided-fund-scope';

/**
 * Resolve a portfolio company's owning fund. Returns the fundId when the company
 * is attributed to a fund, null when the company exists but has no fund
 * (fund_id NULL), or undefined when no such company exists. Kept separate from
 * the scenario data read so the fund-scope guard composes over a single source
 * of truth and stays unit-testable via the storage mock.
 */
export async function resolveCompanyFundId(companyId: number): Promise<number | null | undefined> {
  const company = await storage.getPortfolioCompany(companyId);
  if (!company) {
    return undefined;
  }
  return company.fundId;
}

/**
 * Enforce that the caller may access the fund that owns `companyId`, for routes
 * that key off a portfolio company rather than a fundId param. Writes its own
 * 404 (no such company), 401 (unverifiable token), or 403 (out-of-scope fund, or
 * an unattributed company for a restricted caller) and returns false on denial.
 * Unrestricted (admin/service) callers pass for any existing company. Mirrors
 * enforceProvidedFundScope's deny semantics (403 FUND_ACCESS_DENIED).
 */
export async function enforceCompanyFundScope(
  req: Request,
  res: Response,
  companyId: number
): Promise<boolean> {
  const fundId = await resolveCompanyFundId(companyId);
  if (fundId === undefined) {
    res.status(404).json({ error: 'Company not found' });
    return false;
  }

  const scope = await getVerifiedFundScope(req);
  if (!scope) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization token',
    });
    return false;
  }

  if (scope.unrestricted) {
    return true;
  }

  if (fundId === null || !scope.fundIds.includes(fundId)) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
      message: `You do not have access to fund ${fundId ?? 'unassigned'}`,
    });
    return false;
  }

  return true;
}
