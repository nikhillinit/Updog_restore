/**
 * Adapter layer for transforming between existing data structures and Reserves v1.1
 * Handles conversion, validation, and backwards compatibility
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
// NOTE: This adapter handles legacy data structures with dynamic shapes.
// The `any` types are intentional for backwards compatibility with untyped data.
// TODO: Define strict types for legacy data structures (Issue #TBD)

import type { Company, ReservesInput, ReservesConfig } from '@shared/types/reserves-v11';
import { getCurrentQuarterIndex } from '@/lib/quarter-time';
import { dollarsToCents, centsToDollars, moicToBps, percentToBps } from '@/lib/units';

// Existing fund/company types (adapt based on your actual types)
interface ExistingCompany {
  id?: string;
  name?: string;
  companyName?: string;
  investedAmount?: number;
  invested?: number;
  exitMultiple?: number;
  targetMoic?: number;
  stage?: string;
  sector?: string;
  ownershipPercentage?: number;
  ownership?: number;
  [key: string]: any;
}

interface ExistingFund {
  id?: string;
  fundSize?: number;
  totalCommitted?: number;
  companies?: ExistingCompany[];
  portfolio?: ExistingCompany[];
  reservePercentage?: number;
  reserveRatio?: number;
}

// Company adapter
export function adaptCompany(existing: ExistingCompany): Company {
  // Generate ID if missing
  const id = existing.id || `company-${Math.random().toString(36).substr(2, 9)}`;

  // Get name with fallbacks
  const name = existing.name || existing.companyName || `Company ${id}`;

  // Convert invested amount to cents
  const investedDollars = existing.investedAmount || existing.invested || 0;
  const invested_cents = dollarsToCents(investedDollars);

  // Convert exit multiple to basis points (CRITICAL: use moicToBps to prevent 100× error)
  const exitMultiple = existing.exitMultiple || existing.targetMoic || 1.0;
  const exit_moic_bps = moicToBps(exitMultiple); // 2.5x → 25000 bps (NOT percentToBps!)

  // Get ownership percentage
  const ownership = existing.ownershipPercentage || existing.ownership || 0;
  const ownership_pct = ownership > 1 ? ownership / 100 : ownership; // Normalize to 0-1

  return {
    id,
    name,
    invested_cents,
    exit_moic_bps,
    ownership_pct,
    ...(existing.stage !== undefined && { stage: existing.stage }),
    ...(existing.sector !== undefined && { sector: existing.sector }),
    metadata: {
      source: 'adapter',
      ...(existing.id !== undefined && { original_id: existing.id }),
    },
  };
}

// Fund adapter
export function adaptFundToReservesInput(fund: ExistingFund): ReservesInput {
  // Get companies array with various fallbacks
  const companiesArray = fund.companies || fund.portfolio || [];

  // Convert all companies
  const companies = companiesArray.map(adaptCompany);

  // Calculate fund size in cents
  const fundSizeDollars = fund.fundSize || fund.totalCommitted || 0;
  const fund_size_cents = dollarsToCents(fundSizeDollars);

  return {
    companies,
    fund_size_cents,
    quarter_index: getCurrentQuarterIndex(),
  };
}

// Config adapter
export function adaptReservesConfig(options?: {
  reservePercentage?: number;
  reserveRatio?: number;
  enableRemainPass?: boolean;
  capPercent?: number;
  stageCaps?: Record<string, number>;
  auditLevel?: 'basic' | 'detailed' | 'debug';
}): ReservesConfig {
  const reservePercent = options?.reservePercentage || options?.reserveRatio || 0.15; // Default 15%
  const reserve_bps = percentToBps(reservePercent * 100);

  // Determine cap policy
  let capPolicy;
  if (options?.stageCaps && Object.keys(options.stageCaps).length > 0) {
    capPolicy = {
      kind: 'stage_based' as const,
      default_percent: options.capPercent || 0.5,
      stage_caps: options.stageCaps,
    };
  } else {
    capPolicy = {
      kind: 'fixed_percent' as const,
      default_percent: options?.capPercent || 0.5,
    };
  }

  return {
    reserve_bps,
    remain_passes: options?.enableRemainPass ? 1 : 0,
    cap_policy: capPolicy,
    audit_level: options?.auditLevel || 'basic',
  };
}

// Result adapter (convert back to existing format)
export interface AdaptedReservesResult {
  allocations: Array<{
    companyId: string;
    companyName?: string;
    plannedReserve: number; // In dollars
    reservePercent: number; // As percentage of initial investment
    reason: string;
  }>;
  remainingReserve: number; // In dollars
  totalReserve: number; // In dollars
  companiesFunded: number;
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

export function adaptReservesResult(
  result: any,
  companiesMap?: Map<string, ExistingCompany>
): AdaptedReservesResult {
  if (!result.ok || !result.data) {
    return {
      allocations: [],
      remainingReserve: 0,
      totalReserve: 0,
      companiesFunded: 0,
      success: false,
      errors: [result.error || 'Calculation failed'],
      warnings: result.warnings,
    };
  }

  const { allocations, remaining_cents, metadata } = result.data;

  // Convert allocations back to dollars
  const adaptedAllocations = allocations.map((alloc: any) => {
    const company = companiesMap?.get(alloc.company_id);
    const plannedDollars = centsToDollars(alloc.planned_cents);
    const initialInvestment = company ? company.investedAmount || company.invested || 0 : 0;

    return {
      companyId: alloc.company_id,
      companyName: company?.name || company?.companyName,
      plannedReserve: plannedDollars,
      reservePercent: initialInvestment > 0 ? (plannedDollars / initialInvestment) * 100 : 0,
      reason: alloc.reason,
    };
  });

  return {
    allocations: adaptedAllocations,
    remainingReserve: centsToDollars(remaining_cents),
    totalReserve: centsToDollars(metadata.total_available_cents),
    companiesFunded: metadata.companies_funded,
    success: true,
    warnings: result.warnings,
  };
}

// Validation helpers
export function validateCompanyData(company: ExistingCompany): string[] {
  const errors: string[] = [];

  if (!company.id && !company.name && !company.companyName) {
    errors.push('Company must have an ID or name');
  }

  const invested = company.investedAmount || company.invested;
  if (invested == null || invested < 0) {
    errors.push('Company must have a non-negative invested amount');
  }

  const exitMultiple = company.exitMultiple || company.targetMoic;
  if (exitMultiple != null && exitMultiple < 0) {
    errors.push('Exit multiple must be non-negative');
  }

  return errors;
}

export function validateFundData(fund: ExistingFund): string[] {
  const errors: string[] = [];

  const companies = fund.companies || fund.portfolio;
  if (!companies || companies.length === 0) {
    errors.push('Fund must have at least one company');
  }

  const fundSize = fund.fundSize || fund.totalCommitted;
  if (fundSize != null && fundSize <= 0) {
    errors.push('Fund size must be positive');
  }

  // Validate each company
  companies?.forEach((company: any, index: any) => {
    const companyErrors = validateCompanyData(company);
    companyErrors.forEach((error) => {
      errors.push(`Company ${index + 1}: ${error}`);
    });
  });

  return errors;
}
