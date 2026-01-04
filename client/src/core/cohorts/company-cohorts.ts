/**
 * Company Cohort Keys Computation
 *
 * Computes company-level cohort keys based on earliest included investment.
 * Implements Option B exclusion semantics from design document.
 */

import type { ResolvedInvestment, CompanyCohortKey } from '@shared/types';
import { compareVintageKeys } from '@shared/utils/vintage-resolution';

/**
 * Groups resolved investments by company
 *
 * @param resolved Resolved investments
 * @returns Map of companyId to investments
 */
function groupByCompany(resolved: ResolvedInvestment[]): Map<number, ResolvedInvestment[]> {
  const groups = new Map<number, ResolvedInvestment[]>();

  for (const inv of resolved) {
    const existing = groups.get(inv.companyId);
    if (existing) {
      existing.push(inv);
    } else {
      groups.set(inv.companyId, [inv]);
    }
  }

  return groups;
}

/**
 * Finds the earliest vintage key from a list of resolved investments
 *
 * @param investments Investments to check
 * @returns Earliest vintage key or null if none have valid keys
 */
function findEarliestKey(investments: ResolvedInvestment[]): string | null {
  const validKeys = investments
    .filter((inv) => inv.resolvedVintageKey !== null)
    .map((inv) => inv.resolvedVintageKey as string);

  if (validKeys.length === 0) {
    return null;
  }

  return validKeys.sort(compareVintageKeys)[0] ?? null;
}

/**
 * Computes company cohort keys based on earliest included investment
 *
 * Rules (Option B exclusion semantics):
 * - Company excluded → company excluded from all cohorts
 * - All investments excluded → company excluded
 * - Otherwise → company vintage = earliest included investment's vintage
 *
 * @param resolved Resolved investments
 * @returns Array of company cohort keys with provenance
 */
export function computeCompanyCohortKeys(resolved: ResolvedInvestment[]): CompanyCohortKey[] {
  const companyGroups = groupByCompany(resolved);
  const result: CompanyCohortKey[] = [];

  for (const [companyId, investments] of companyGroups) {
    // Check if company is excluded
    const isCompanyExcluded = investments.some((inv) => inv.companyExcluded);

    if (isCompanyExcluded) {
      result.push({
        companyId,
        companyCohortKey: null,
        earliestAnyKey: null,
        earliestIncludedKey: null,
        wasShifted: false,
        shiftReason: null,
        includedInvestmentCount: 0,
        excludedInvestmentCount: investments.length,
      });
      continue;
    }

    // Split investments into included and excluded
    const includedInvestments = investments.filter((inv) => !inv.investmentExcluded);
    const excludedInvestments = investments.filter((inv) => inv.investmentExcluded);

    // Find earliest keys
    const earliestAnyKey = findEarliestKey(investments);
    const earliestIncludedKey = findEarliestKey(includedInvestments);

    // Check for vintage shift
    const wasShifted = earliestAnyKey !== null && earliestIncludedKey !== null && earliestAnyKey !== earliestIncludedKey;

    // Determine shift reason
    let shiftReason: 'first_check_excluded' | 'override' | null = null;
    if (wasShifted) {
      // Check if the earliest investment was excluded
      const earliestInvestment = investments.find(
        (inv) => inv.resolvedVintageKey === earliestAnyKey
      );
      if (earliestInvestment?.investmentExcluded) {
        shiftReason = 'first_check_excluded';
      } else {
        shiftReason = 'override';
      }
    }

    result.push({
      companyId,
      companyCohortKey: earliestIncludedKey,
      earliestAnyKey,
      earliestIncludedKey,
      wasShifted,
      shiftReason,
      includedInvestmentCount: includedInvestments.length,
      excludedInvestmentCount: excludedInvestments.length,
    });
  }

  return result;
}

/**
 * Gets companies with shifted vintages
 *
 * @param cohortKeys Company cohort keys
 * @returns Array of shifted company examples
 */
export function getShiftedCompanies(
  cohortKeys: CompanyCohortKey[]
): Array<{
  companyId: number;
  from: string;
  to: string;
  reason: 'first_check_excluded' | 'override';
}> {
  return cohortKeys
    .filter((ck) => ck.wasShifted && ck.earliestAnyKey && ck.earliestIncludedKey && ck.shiftReason)
    .map((ck) => ({
      companyId: ck.companyId,
      from: ck.earliestAnyKey as string,
      to: ck.earliestIncludedKey as string,
      reason: ck.shiftReason as 'first_check_excluded' | 'override',
    }));
}

/**
 * Counts companies by inclusion status
 *
 * @param cohortKeys Company cohort keys
 * @returns Counts of included and excluded companies
 */
export function countCompanies(cohortKeys: CompanyCohortKey[]): {
  included: number;
  excluded: number;
  shifted: number;
} {
  let included = 0;
  let excluded = 0;
  let shifted = 0;

  for (const ck of cohortKeys) {
    if (ck.companyCohortKey === null) {
      excluded++;
    } else {
      included++;
      if (ck.wasShifted) {
        shifted++;
      }
    }
  }

  return { included, excluded, shifted };
}
