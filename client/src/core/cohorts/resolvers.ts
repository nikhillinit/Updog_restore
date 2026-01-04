/**
 * Resolved Investments Resolver
 *
 * Resolves sector and vintage information for investments using the
 * normalization layer (sector_taxonomy, sector_mappings, company_overrides, investment_overrides).
 */

import type { ResolvedInvestment, VintageGranularity } from '@shared/types';
import { normalizeSector, BLANK_SECTOR_TOKEN } from '@shared/utils/sector-normalization';
import { resolveVintageKey, type VintageSource } from '@shared/utils/vintage-resolution';

/**
 * Input data for resolution
 */
export interface ResolutionInput {
  fundId: number;
  taxonomyVersion: string;
  granularity: VintageGranularity;

  // Portfolio data
  companies: Array<{
    id: number;
    name: string;
    sector: string | null;
  }>;

  investments: Array<{
    id: number;
    companyId: number;
    investmentDate: Date | null;
    amount: string | null;
    round: string | null;
  }>;

  // Normalization layer data
  sectorTaxonomy: Array<{
    id: string;
    slug: string;
    name: string;
    isSystem: boolean;
  }>;

  sectorMappings: Array<{
    rawValueNormalized: string;
    canonicalSectorId: string;
  }>;

  companyOverrides: Array<{
    companyId: number;
    canonicalSectorId: string | null;
    excludeFromCohorts: boolean;
  }>;

  investmentOverrides: Array<{
    investmentId: number;
    excludeFromCohorts: boolean;
    vintageYear: number | null;
    vintageQuarter: number | null;
  }>;
}

/**
 * Resolution context - maps and lookups built from input data
 */
interface ResolutionContext {
  // Lookups
  companyMap: Map<number, { name: string; sector: string | null }>;
  sectorTaxonomyMap: Map<string, { slug: string; name: string; isSystem: boolean }>;
  sectorMappingMap: Map<string, string>; // rawValueNormalized -> canonicalSectorId
  companyOverrideMap: Map<number, { canonicalSectorId: string | null; excludeFromCohorts: boolean }>;
  investmentOverrideMap: Map<
    number,
    { excludeFromCohorts: boolean; vintageYear: number | null; vintageQuarter: number | null }
  >;

  // System sectors
  unmappedSectorId: string;
  unmappedSectorName: string;

  // Config
  granularity: VintageGranularity;
}

/**
 * Builds resolution context from input data
 */
function buildResolutionContext(input: ResolutionInput): ResolutionContext {
  const companyMap = new Map<number, { name: string; sector: string | null }>();
  for (const company of input.companies) {
    companyMap.set(company.id, { name: company.name, sector: company.sector });
  }

  const sectorTaxonomyMap = new Map<string, { slug: string; name: string; isSystem: boolean }>();
  let unmappedSectorId = '';
  let unmappedSectorName = 'Unmapped';

  for (const sector of input.sectorTaxonomy) {
    sectorTaxonomyMap.set(sector.id, {
      slug: sector.slug,
      name: sector.name,
      isSystem: sector.isSystem,
    });
    if (sector.slug === 'unmapped') {
      unmappedSectorId = sector.id;
      unmappedSectorName = sector.name;
    }
  }

  const sectorMappingMap = new Map<string, string>();
  for (const mapping of input.sectorMappings) {
    sectorMappingMap.set(mapping.rawValueNormalized, mapping.canonicalSectorId);
  }

  const companyOverrideMap = new Map<
    number,
    { canonicalSectorId: string | null; excludeFromCohorts: boolean }
  >();
  for (const override of input.companyOverrides) {
    companyOverrideMap.set(override.companyId, {
      canonicalSectorId: override.canonicalSectorId,
      excludeFromCohorts: override.excludeFromCohorts,
    });
  }

  const investmentOverrideMap = new Map<
    number,
    { excludeFromCohorts: boolean; vintageYear: number | null; vintageQuarter: number | null }
  >();
  for (const override of input.investmentOverrides) {
    investmentOverrideMap.set(override.investmentId, {
      excludeFromCohorts: override.excludeFromCohorts,
      vintageYear: override.vintageYear,
      vintageQuarter: override.vintageQuarter,
    });
  }

  return {
    companyMap,
    sectorTaxonomyMap,
    sectorMappingMap,
    companyOverrideMap,
    investmentOverrideMap,
    unmappedSectorId,
    unmappedSectorName,
    granularity: input.granularity,
  };
}

/**
 * Resolves sector for a company using 4-tier precedence
 *
 * 1. Company excluded → exclude
 * 2. Company override sector → use override
 * 3. Sector mapping → use mapped canonical sector
 * 4. Fallback → Unmapped
 */
function resolveSector(
  companyId: number,
  rawSector: string | null,
  ctx: ResolutionContext
): {
  canonicalSectorId: string;
  canonicalSectorName: string;
  sectorSource: 'company_override' | 'mapping' | 'unmapped';
  companyExcluded: boolean;
} {
  const companyOverride = ctx.companyOverrideMap.get(companyId);

  // Tier 1: Company excluded
  if (companyOverride?.excludeFromCohorts) {
    return {
      canonicalSectorId: ctx.unmappedSectorId,
      canonicalSectorName: ctx.unmappedSectorName,
      sectorSource: 'unmapped',
      companyExcluded: true,
    };
  }

  // Tier 2: Company override sector
  if (companyOverride?.canonicalSectorId) {
    const sector = ctx.sectorTaxonomyMap.get(companyOverride.canonicalSectorId);
    return {
      canonicalSectorId: companyOverride.canonicalSectorId,
      canonicalSectorName: sector?.name ?? 'Unknown',
      sectorSource: 'company_override',
      companyExcluded: false,
    };
  }

  // Tier 3: Sector mapping
  const normalizedSector = normalizeSector(rawSector);
  const mappedSectorId = ctx.sectorMappingMap.get(normalizedSector);

  if (mappedSectorId) {
    const sector = ctx.sectorTaxonomyMap.get(mappedSectorId);
    return {
      canonicalSectorId: mappedSectorId,
      canonicalSectorName: sector?.name ?? 'Unknown',
      sectorSource: 'mapping',
      companyExcluded: false,
    };
  }

  // Tier 4: Unmapped fallback
  return {
    canonicalSectorId: ctx.unmappedSectorId,
    canonicalSectorName: ctx.unmappedSectorName,
    sectorSource: 'unmapped',
    companyExcluded: false,
  };
}

/**
 * Resolves vintage for an investment using 3-tier precedence
 *
 * 1. Investment excluded → null
 * 2. Override vintage → use override
 * 3. Investment date → derive
 */
function resolveInvestmentVintage(
  investmentId: number,
  investmentDate: Date | null,
  ctx: ResolutionContext
): {
  resolvedVintageKey: string | null;
  vintageSource: VintageSource;
  investmentExcluded: boolean;
} {
  const investmentOverride = ctx.investmentOverrideMap.get(investmentId);

  const result = resolveVintageKey({
    investmentDate,
    overrideYear: investmentOverride?.vintageYear ?? null,
    overrideQuarter: investmentOverride?.vintageQuarter ?? null,
    excludeFromCohorts: investmentOverride?.excludeFromCohorts ?? false,
    granularity: ctx.granularity,
  });

  return {
    resolvedVintageKey: result.key,
    vintageSource: result.source,
    investmentExcluded: investmentOverride?.excludeFromCohorts ?? false,
  };
}

/**
 * Resolves all investments with sector and vintage information
 *
 * @param input Resolution input data
 * @returns Array of resolved investments
 */
export function getResolvedInvestments(input: ResolutionInput): ResolvedInvestment[] {
  const ctx = buildResolutionContext(input);
  const resolved: ResolvedInvestment[] = [];

  for (const investment of input.investments) {
    const company = ctx.companyMap.get(investment.companyId);
    if (!company) {
      // Skip investments without matching company (data integrity issue)
      continue;
    }

    const rawSector = company.sector;
    const rawSectorNormalized = normalizeSector(rawSector);

    // Resolve sector (4-tier precedence)
    const sectorResolution = resolveSector(investment.companyId, rawSector, ctx);

    // Resolve vintage (3-tier precedence)
    const vintageResolution = resolveInvestmentVintage(
      investment.id,
      investment.investmentDate,
      ctx
    );

    resolved.push({
      investmentId: investment.id,
      companyId: investment.companyId,
      companyName: company.name,
      rawSector,
      rawSectorNormalized,
      canonicalSectorId: sectorResolution.canonicalSectorId,
      canonicalSectorName: sectorResolution.canonicalSectorName,
      sectorSource: sectorResolution.sectorSource,
      companyExcluded: sectorResolution.companyExcluded,
      investmentExcluded: vintageResolution.investmentExcluded,
      resolvedVintageKey: vintageResolution.resolvedVintageKey,
      vintageSource: vintageResolution.vintageSource,
      investmentDate: investment.investmentDate,
      investmentAmount: investment.amount ? parseFloat(investment.amount) : null,
      stage: investment.round,
    });
  }

  return resolved;
}

/**
 * Gets unmapped sectors from resolved investments
 *
 * @param resolved Resolved investments
 * @returns Array of unmapped sector info
 */
export function getUnmappedSectors(
  resolved: ResolvedInvestment[]
): Array<{
  rawValue: string;
  rawValueNormalized: string;
  companyCount: number;
  investmentCount: number;
  totalInvested: number;
}> {
  const unmappedMap = new Map<
    string,
    {
      rawValue: string;
      companies: Set<number>;
      investmentCount: number;
      totalInvested: number;
    }
  >();

  for (const inv of resolved) {
    if (inv.sectorSource === 'unmapped' && !inv.companyExcluded) {
      const existing = unmappedMap.get(inv.rawSectorNormalized);
      if (existing) {
        existing.companies.add(inv.companyId);
        existing.investmentCount++;
        existing.totalInvested += inv.investmentAmount ?? 0;
      } else {
        unmappedMap.set(inv.rawSectorNormalized, {
          rawValue: inv.rawSector ?? BLANK_SECTOR_TOKEN,
          companies: new Set([inv.companyId]),
          investmentCount: 1,
          totalInvested: inv.investmentAmount ?? 0,
        });
      }
    }
  }

  return Array.from(unmappedMap.entries()).map(([normalized, data]) => ({
    rawValue: data.rawValue,
    rawValueNormalized: normalized,
    companyCount: data.companies.size,
    investmentCount: data.investmentCount,
    totalInvested: data.totalInvested,
  }));
}
