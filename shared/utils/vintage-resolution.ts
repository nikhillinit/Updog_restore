/**
 * Vintage Resolution Helper
 *
 * Resolves vintage keys (year or quarter) from investment dates and overrides.
 * Implements the 3-tier precedence rules from the design document.
 */

/**
 * Vintage granularity options
 */
export type VintageGranularity = 'year' | 'quarter';

/**
 * Source of the resolved vintage key
 */
export type VintageSource =
  | 'override_full' // Override provided both year and quarter (for quarter granularity)
  | 'override_year' // Override provided year only
  | 'derived' // Derived from investment date
  | 'missing'; // No date or override available

/**
 * Result of vintage resolution
 */
export interface ResolvedVintage {
  /** The resolved vintage key (e.g., "2021" or "2021-Q3") */
  key: string | null;
  /** Source of the vintage key */
  source: VintageSource;
  /** Year component */
  year: number | null;
  /** Quarter component (1-4), only for quarter granularity */
  quarter: number | null;
}

/**
 * Gets the quarter (1-4) from a date
 *
 * @param date - The date to extract quarter from
 * @returns Quarter number (1-4)
 */
export function getQuarterFromDate(date: Date): number {
  const month = date.getMonth(); // 0-11
  return Math.floor(month / 3) + 1;
}

/**
 * Formats a vintage key based on granularity
 *
 * @param year - The year
 * @param quarter - The quarter (optional, required for quarter granularity)
 * @param granularity - The vintage granularity
 * @returns Formatted vintage key
 */
export function formatVintageKey(
  year: number,
  quarter: number | null,
  granularity: VintageGranularity
): string {
  if (granularity === 'quarter') {
    if (quarter === null) {
      throw new Error('Quarter is required for quarter granularity');
    }
    return `${year}-Q${quarter}`;
  }
  return String(year);
}

/**
 * Parses a vintage key into its components
 *
 * @param key - The vintage key (e.g., "2021" or "2021-Q3")
 * @returns Parsed year and quarter (if present)
 */
export function parseVintageKey(key: string): { year: number; quarter: number | null } {
  const quarterMatch = key.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch && quarterMatch[1] && quarterMatch[2]) {
    return {
      year: parseInt(quarterMatch[1], 10),
      quarter: parseInt(quarterMatch[2], 10),
    };
  }

  const yearMatch = key.match(/^(\d{4})$/);
  if (yearMatch && yearMatch[1]) {
    return {
      year: parseInt(yearMatch[1], 10),
      quarter: null,
    };
  }

  throw new Error(`Invalid vintage key format: ${key}`);
}

/**
 * Compares two vintage keys for sorting
 *
 * @param a - First vintage key
 * @param b - Second vintage key
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareVintageKeys(a: string, b: string): number {
  const parsedA = parseVintageKey(a);
  const parsedB = parseVintageKey(b);

  // Compare years first
  if (parsedA.year !== parsedB.year) {
    return parsedA.year - parsedB.year;
  }

  // If years are equal, compare quarters (null quarters come after numbered quarters)
  const quarterA = parsedA.quarter ?? 5; // Treat null as after Q4
  const quarterB = parsedB.quarter ?? 5;
  return quarterA - quarterB;
}

/**
 * Resolves the vintage key for an investment using 3-tier precedence
 *
 * Precedence rules:
 * 1. If investment is excluded (excludeFromCohorts = true) → return null
 * 2. If override vintage year is provided → use override
 *    - For quarter granularity: use override quarter if provided, else derive from date
 * 3. Else derive from investment date
 *
 * @param params - Resolution parameters
 * @returns Resolved vintage information
 */
export function resolveVintageKey(params: {
  /** Investment date (nullable) */
  investmentDate: Date | null;
  /** Override vintage year (nullable) */
  overrideYear: number | null;
  /** Override vintage quarter (nullable, 1-4) */
  overrideQuarter: number | null;
  /** Whether investment is excluded from cohorts */
  excludeFromCohorts: boolean;
  /** Vintage granularity */
  granularity: VintageGranularity;
}): ResolvedVintage {
  const { investmentDate, overrideYear, overrideQuarter, excludeFromCohorts, granularity } = params;

  // Tier 1: Excluded investments return null
  if (excludeFromCohorts) {
    return {
      key: null,
      source: 'missing',
      year: null,
      quarter: null,
    };
  }

  // Tier 2: Check for override
  if (overrideYear !== null) {
    if (granularity === 'quarter') {
      // For quarter granularity, check if quarter override exists
      if (overrideQuarter !== null) {
        return {
          key: formatVintageKey(overrideYear, overrideQuarter, granularity),
          source: 'override_full',
          year: overrideYear,
          quarter: overrideQuarter,
        };
      }

      // If no quarter override, try to derive from investment date
      if (investmentDate !== null) {
        const derivedQuarter = getQuarterFromDate(investmentDate);
        return {
          key: formatVintageKey(overrideYear, derivedQuarter, granularity),
          source: 'override_year', // Year from override, quarter derived
          year: overrideYear,
          quarter: derivedQuarter,
        };
      }

      // No way to determine quarter - return year-only key (will need handling)
      return {
        key: null, // Cannot determine full key for quarter granularity
        source: 'missing',
        year: overrideYear,
        quarter: null,
      };
    }

    // Year granularity - just use the year
    return {
      key: formatVintageKey(overrideYear, null, granularity),
      source: 'override_year',
      year: overrideYear,
      quarter: null,
    };
  }

  // Tier 3: Derive from investment date
  if (investmentDate !== null) {
    const year = investmentDate.getFullYear();
    const quarter = granularity === 'quarter' ? getQuarterFromDate(investmentDate) : null;

    return {
      key: formatVintageKey(year, quarter, granularity),
      source: 'derived',
      year,
      quarter,
    };
  }

  // No date or override available
  return {
    key: null,
    source: 'missing',
    year: null,
    quarter: null,
  };
}

/**
 * Gets the earliest vintage key from a list of resolved vintages
 *
 * @param vintages - List of resolved vintages
 * @returns The earliest vintage key, or null if no valid keys
 */
export function getEarliestVintageKey(vintages: ResolvedVintage[]): string | null {
  const validKeys = vintages.filter((v) => v.key !== null).map((v) => v.key as string);

  if (validKeys.length === 0) {
    return null;
  }

  const sorted = validKeys.sort(compareVintageKeys);
  return sorted[0] ?? null;
}
