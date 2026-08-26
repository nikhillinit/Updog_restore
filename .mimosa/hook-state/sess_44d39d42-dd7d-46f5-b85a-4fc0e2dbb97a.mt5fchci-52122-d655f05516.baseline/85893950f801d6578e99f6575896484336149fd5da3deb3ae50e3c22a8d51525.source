import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageState = vi.hoisted(() => ({
  getPortfolioCompany: vi.fn(),
}));

const scopeState = vi.hoisted(() => ({
  getVerifiedFundScope: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: storageState,
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  getVerifiedFundScope: scopeState.getVerifiedFundScope,
}));

import {
  enforceCompanyFundScope,
  resolveCompanyFundId,
} from '../../../server/lib/auth/company-fund-scope';

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn(() => res) as unknown as Response['status'];
  res.json = vi.fn(() => res) as unknown as Response['json'];
  return res;
}

function resetState() {
  storageState.getPortfolioCompany.mockReset();
  scopeState.getVerifiedFundScope.mockReset();
}

describe('resolveCompanyFundId', () => {
  beforeEach(() => resetState());

  it('returns the fundId of an attributed company', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: 7 });
    await expect(resolveCompanyFundId(1)).resolves.toBe(7);
  });

  it('returns null for a company with no fund', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: null });
    await expect(resolveCompanyFundId(1)).resolves.toBeNull();
  });

  it('returns undefined when the company does not exist', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce(undefined);
    await expect(resolveCompanyFundId(1)).resolves.toBeUndefined();
  });
});

describe('enforceCompanyFundScope', () => {
  beforeEach(() => resetState());

  it('404s and skips the scope check when the company does not exist', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce(undefined);
    const res = mockRes();
    const ok = await enforceCompanyFundScope({} as Request, res, 1);
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(scopeState.getVerifiedFundScope).not.toHaveBeenCalled();
  });

  it('401s when the token cannot be verified', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: 7 });
    scopeState.getVerifiedFundScope.mockResolvedValueOnce(null);
    const res = mockRes();
    const ok = await enforceCompanyFundScope({} as Request, res, 1);
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('allows an unrestricted caller for any existing company', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: 7 });
    scopeState.getVerifiedFundScope.mockResolvedValueOnce({ unrestricted: true, fundIds: [] });
    const res = mockRes();
    await expect(enforceCompanyFundScope({} as Request, res, 1)).resolves.toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows an unrestricted caller even for an unattributed company', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: null });
    scopeState.getVerifiedFundScope.mockResolvedValueOnce({ unrestricted: true, fundIds: [] });
    const res = mockRes();
    await expect(enforceCompanyFundScope({} as Request, res, 1)).resolves.toBe(true);
  });

  it('allows a restricted caller whose scope includes the fund', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: 7 });
    scopeState.getVerifiedFundScope.mockResolvedValueOnce({ unrestricted: false, fundIds: [7, 9] });
    const res = mockRes();
    await expect(enforceCompanyFundScope({} as Request, res, 1)).resolves.toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('403s a restricted caller whose scope excludes the fund', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: 7 });
    scopeState.getVerifiedFundScope.mockResolvedValueOnce({ unrestricted: false, fundIds: [9] });
    const res = mockRes();
    const ok = await enforceCompanyFundScope({} as Request, res, 1);
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('403s a restricted caller for an unattributed company', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce({ id: 1, fundId: null });
    scopeState.getVerifiedFundScope.mockResolvedValueOnce({ unrestricted: false, fundIds: [9] });
    const res = mockRes();
    const ok = await enforceCompanyFundScope({} as Request, res, 1);
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
