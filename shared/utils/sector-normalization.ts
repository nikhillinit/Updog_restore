/**
 * Sector Normalization Helper
 *
 * Provides deterministic normalization of sector strings for consistent mapping.
 * This is the single source of truth for sector string normalization.
 */

/**
 * Token used to represent null, undefined, or empty sector values
 */
export const BLANK_SECTOR_TOKEN = '(blank)';

/**
 * Normalizes a raw sector string for consistent matching
 *
 * Normalization rules:
 * 1. Trim leading/trailing whitespace
 * 2. Collapse multiple spaces to single space
 * 3. Convert to lowercase
 * 4. Handle null/undefined/empty as deterministic token "(blank)"
 *
 * @param rawValue - The raw sector string to normalize
 * @returns Normalized sector string
 *
 * @example
 * normalizeSector("  SaaS  ") // => "saas"
 * normalizeSector("Health   Care") // => "health care"
 * normalizeSector("") // => "(blank)"
 * normalizeSector(null) // => "(blank)"
 */
export function normalizeSector(rawValue: string | null | undefined): string {
  // Handle null/undefined/empty
  if (rawValue === null || rawValue === undefined) {
    return BLANK_SECTOR_TOKEN;
  }

  // Trim whitespace
  const trimmed = rawValue.trim();

  // Handle empty after trimming
  if (trimmed === '') {
    return BLANK_SECTOR_TOKEN;
  }

  // Collapse multiple spaces to single space
  const collapsed = trimmed.replace(/\s+/g, ' ');

  // Convert to lowercase
  return collapsed.toLowerCase();
}

/**
 * Generates a URL-safe slug from a sector name
 *
 * @param name - The sector name to slugify
 * @returns URL-safe slug
 *
 * @example
 * slugifySector("SaaS & Cloud") // => "saas-cloud"
 * slugifySector("Health Care") // => "health-care"
 */
export function slugifySector(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Checks if a sector value is considered blank/unmapped
 *
 * @param normalizedValue - The normalized sector value
 * @returns true if the value represents a blank/missing sector
 */
export function isBlankSector(normalizedValue: string): boolean {
  return normalizedValue === BLANK_SECTOR_TOKEN;
}
