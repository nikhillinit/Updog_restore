/**
 * Advanced Cohort Analysis Engine
 *
 * Unit-agnostic pipeline that supports both company-level and investment-level cohorts.
 * This is the main entry point for the new cohort analysis functionality.
 */

import type {
  CohortAnalyzeRequest,
  CohortAnalyzeResponse,
  CohortRow,
  ResolvedInvestment,
  CoverageSummaryType,
  VintageGranularity,
  CohortUnit,
} from '@shared/types';
import { calculateCoverage, type CoverageData } from '@shared/utils/coverage-calculations';

import { getResolvedInvestments, getUnmappedSectors, type ResolutionInput } from './resolvers';
import { computeCompanyCohortKeys, getShiftedCompanies, countCompanies } from './company-cohorts';
import { getCashFlowEvents, groupEventsByCohortSector, type LotData } from './cash-flows';
import { generateCohortRow } from './metrics';

/**
 * Input for the advanced cohort analysis engine
 */
export interface AnalyzeCohortInput {
  // Request parameters
  request: CohortAnalyzeRequest;

  // Cohort definition
  cohortDefinition: {
    id: string;
    fundId: number;
    name: string;
    vintageGranularity: VintageGranularity;
    sectorTaxonomyVersion: string;
    unit: CohortUnit;
  };

  // Resolution input (portfolio + normalization data)
  resolutionInput: ResolutionInput;

  // Lots data for cash flow calculation
  lots: LotData[];

  // Optional as-of date for residual value calculation
  asOfDate?: Date;
}

/**
 * Calculates provenance breakdowns from resolved investments
 */
function calculateProvenance(
  resolved: ResolvedInvestment[],
  _unit: CohortUnit
): {
  sectorSourceBreakdown: Record<'company_override' | 'mapping' | 'unmapped', number>;
  vintageSourceBreakdown: Record<string, number>;
} {
  const sectorBreakdown: Record<'company_override' | 'mapping' | 'unmapped', number> = {
    company_override: 0,
    mapping: 0,
    unmapped: 0,
  };

  const vintageBreakdown: Record<string, number> = {};

  for (const inv of resolved) {
    if (!inv.companyExcluded && !inv.investmentExcluded) {
      sectorBreakdown[inv.sectorSource]++;

      const vintageKey = inv.vintageSource || 'unknown';
      vintageBreakdown[vintageKey] = (vintageBreakdown[vintageKey] || 0) + 1;
    }
  }

  return {
    sectorSourceBreakdown: sectorBreakdown,
    vintageSourceBreakdown: vintageBreakdown,
  };
}

/**
 * Calculates coverage from resolved investments and lots
 */
function calculateCoverageFromData(
  resolved: ResolvedInvestment[],
  lots: LotData[]
): CoverageSummaryType {
  // Count investments with vintage data
  const includedInvestments = resolved.filter(
    (inv) => !inv.companyExcluded && !inv.investmentExcluded
  );
  const investmentsWithVintage = includedInvestments.filter(
    (inv) => inv.resolvedVintageKey !== null
  );

  // Count lots with paid-in data
  const lotsWithPaidIn = lots.filter((lot) => lot.costBasisCents > 0);

  // Count lots with distribution data (have disposal info)
  const lotsWithDistributions = lots.filter(
    (lot) => lot.disposalDate !== undefined && lot.disposalProceeds !== undefined
  );

  const data: CoverageData = {
    totalLots: lots.length,
    lotsWithPaidIn: lotsWithPaidIn.length,
    lotsWithDistributions: lotsWithDistributions.length,
    totalInvestments: includedInvestments.length,
    investmentsWithVintage: investmentsWithVintage.length,
  };

  return calculateCoverage(data);
}

function hasActiveRequestFilters(request: CohortAnalyzeRequest): boolean {
  return (
    (request.sectorIds !== undefined && request.sectorIds.length > 0) ||
    (request.stages !== undefined && request.stages.length > 0) ||
    request.dateRange?.start !== undefined ||
    request.dateRange?.end !== undefined
  );
}

function parseDateBoundary(value: string | undefined, boundary: 'start' | 'end'): Date | null {
  if (value === undefined) {
    return null;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const hours = boundary === 'end' ? 23 : 0;
    const minutes = boundary === 'end' ? 59 : 0;
    const seconds = boundary === 'end' ? 59 : 0;
    const milliseconds = boundary === 'end' ? 999 : 0;
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes, seconds, milliseconds)
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function applyRequestFilters(
  resolved: ResolvedInvestment[],
  request: CohortAnalyzeRequest
): ResolvedInvestment[] {
  const sectorIds =
    request.sectorIds !== undefined && request.sectorIds.length > 0
      ? new Set(request.sectorIds)
      : null;
  const stages =
    request.stages !== undefined && request.stages.length > 0 ? new Set(request.stages) : null;
  const dateRange = request.dateRange;
  const startDate = parseDateBoundary(dateRange?.start, 'start');
  const endDate = parseDateBoundary(dateRange?.end, 'end');
  const hasDateFilter = dateRange?.start !== undefined || dateRange?.end !== undefined;

  return resolved.filter((inv) => {
    if (sectorIds !== null && !sectorIds.has(inv.canonicalSectorId)) {
      return false;
    }

    if (stages !== null && (inv.stage === null || !stages.has(inv.stage))) {
      return false;
    }

    if (hasDateFilter) {
      if (inv.investmentDate === null) {
        return false;
      }

      const investmentTime = inv.investmentDate.getTime();
      if (startDate !== null && investmentTime < startDate.getTime()) {
        return false;
      }
      if (endDate !== null && investmentTime > endDate.getTime()) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Groups investments by cohort key and sector
 */
function groupInvestmentsByCohortSector(
  resolved: ResolvedInvestment[],
  companyCohortKeys: Map<number, string | null>,
  unit: CohortUnit
): Map<string, ResolvedInvestment[]> {
  const groups = new Map<string, ResolvedInvestment[]>();

  for (const inv of resolved) {
    if (inv.companyExcluded || inv.investmentExcluded) {
      continue;
    }

    let cohortKey: string | null;
    if (unit === 'company') {
      cohortKey = companyCohortKeys.get(inv.companyId) ?? null;
    } else {
      cohortKey = inv.resolvedVintageKey;
    }

    if (!cohortKey) {
      continue;
    }

    const groupKey = `${cohortKey}:${inv.canonicalSectorId}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(inv);
    } else {
      groups.set(groupKey, [inv]);
    }
  }

  return groups;
}

/**
 * Counts unique companies and investments in a group
 */
function countInGroup(investments: ResolvedInvestment[]): {
  companies: number;
  investments: number;
} {
  const companyIds = new Set<number>();
  for (const inv of investments) {
    companyIds.add(inv.companyId);
  }
  return {
    companies: companyIds.size,
    investments: investments.length,
  };
}

/**
 * Main cohort analysis function
 *
 * Implements the unit-agnostic pipeline:
 * 1. Load cohort definition
 * 2. Resolve investments (sector + vintage)
 * 3. Compute company cohort keys (if unit=company)
 * 4. Generate cash flow events
 * 5. Calculate metrics per cohort bucket
 * 6. Build response with provenance
 */
export function analyzeCohorts(input: AnalyzeCohortInput): CohortAnalyzeResponse {
  const { request, cohortDefinition, resolutionInput, lots, asOfDate } = input;
  const { unit } = cohortDefinition;

  // Step 1: Resolve all investments
  const resolved = applyRequestFilters(getResolvedInvestments(resolutionInput), request);
  const filteredInvestmentIds = new Set(resolved.map((inv) => inv.investmentId));
  const filteredLots = hasActiveRequestFilters(request)
    ? lots.filter((lot) => filteredInvestmentIds.has(lot.investmentId))
    : lots;

  // Step 2: Compute company cohort keys (always needed for company-level cohorts)
  const companyCohortKeysList = computeCompanyCohortKeys(resolved);
  const companyCohortKeys = new Map<number, string | null>();
  for (const ck of companyCohortKeysList) {
    companyCohortKeys.set(ck.companyId, ck.companyCohortKey);
  }

  // Step 3: Generate cash flow events
  const cashFlowEvents = getCashFlowEvents({
    lots: filteredLots,
    resolvedInvestments: resolved,
    companyCohortKeys: companyCohortKeysList,
    unit,
    asOfDate,
  });

  // Step 4: Group events by cohort and sector
  const eventGroups = groupEventsByCohortSector(cashFlowEvents);
  const investmentGroups = groupInvestmentsByCohortSector(resolved, companyCohortKeys, unit);

  // Step 5: Calculate coverage
  const coverage = calculateCoverageFromData(resolved, filteredLots);

  // Step 6: Calculate overall provenance
  const _globalProvenance = calculateProvenance(resolved, unit);

  // Step 7: Get shifted companies info
  const shiftedCompanies = getShiftedCompanies(companyCohortKeysList);
  const companyStats = countCompanies(companyCohortKeysList);

  // Step 8: Build sector lookup
  const sectorLookup = new Map<string, string>();
  for (const sector of resolutionInput.sectorTaxonomy) {
    sectorLookup.set(sector.id, sector.name);
  }

  // Step 9: Generate cohort rows
  const rows: CohortRow[] = [];
  const processedKeys = new Set<string>();

  // Process event groups
  for (const [groupKey, events] of eventGroups) {
    processedKeys.add(groupKey);
    const [cohortKey, sectorId] = groupKey.split(':');
    if (!cohortKey || !sectorId) continue;

    const sectorName = sectorLookup.get(sectorId) ?? 'Unknown';
    const investments = investmentGroups.get(groupKey) ?? [];
    const counts = countInGroup(investments);

    // Calculate provenance for this group
    const groupProvenance = calculateProvenance(investments, unit);

    rows.push(
      generateCohortRow({
        cohortKey,
        sectorId,
        sectorName,
        events,
        companyCount: counts.companies,
        investmentCount: counts.investments,
        coverage,
        sectorSourceBreakdown: groupProvenance.sectorSourceBreakdown,
        vintageSourceBreakdown: groupProvenance.vintageSourceBreakdown,
        shiftedCompanies: unit === 'company' ? companyStats.shifted : undefined,
      })
    );
  }

  // Add empty rows for investment groups without events (exposure only)
  for (const [groupKey, investments] of investmentGroups) {
    if (processedKeys.has(groupKey)) {
      continue;
    }

    const [cohortKey, sectorId] = groupKey.split(':');
    if (!cohortKey || !sectorId) continue;

    const sectorName = sectorLookup.get(sectorId) ?? 'Unknown';
    const counts = countInGroup(investments);
    const groupProvenance = calculateProvenance(investments, unit);

    // Calculate exposure from investments (no events)
    let paidIn = 0;
    for (const inv of investments) {
      paidIn += inv.investmentAmount ?? 0;
    }

    rows.push({
      cohortKey,
      sectorId,
      sectorName,
      counts: {
        companies: counts.companies,
        investments: counts.investments,
      },
      exposure: {
        paidIn,
        distributions: 0,
      },
      performance: undefined, // No events, no performance metrics
      coverage,
      provenance: {
        sectorSourceBreakdown: groupProvenance.sectorSourceBreakdown,
        vintageSourceBreakdown: groupProvenance.vintageSourceBreakdown,
        shiftedCompanies: unit === 'company' ? companyStats.shifted : undefined,
      },
    });
  }

  // Sort rows by cohort key then sector name
  rows.sort((a, b) => {
    const cohortCmp = a.cohortKey.localeCompare(b.cohortKey);
    if (cohortCmp !== 0) return cohortCmp;
    return a.sectorName.localeCompare(b.sectorName);
  });

  // Step 10: Get unmapped sectors
  const unmapped = getUnmappedSectors(resolved);

  // Step 11: Build response
  const response: CohortAnalyzeResponse = {
    cohortDefinition: {
      id: cohortDefinition.id,
      fundId: cohortDefinition.fundId,
      name: cohortDefinition.name,
      vintageGranularity: cohortDefinition.vintageGranularity,
      sectorTaxonomyVersion: cohortDefinition.sectorTaxonomyVersion,
      unit: cohortDefinition.unit,
    },
    rows,
    coverage,
  };

  // Add unmapped sectors if any
  if (unmapped.length > 0) {
    response.unmapped = unmapped;
  }

  // Add provenance for company-level cohorts
  if (unit === 'company' && shiftedCompanies.length > 0) {
    response.provenance = {
      shiftedCompanyCount: shiftedCompanies.length,
      examples: shiftedCompanies.slice(0, 5).map((sc) => ({
        companyId: String(sc.companyId),
        from: sc.from,
        to: sc.to,
        reason: sc.reason,
      })),
    };
  }

  return response;
}
