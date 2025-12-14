/**
 * Deterministic Sorting Utilities for Capital Allocation
 *
 * Per CA-SEMANTIC-LOCK.md Section 4.3:
 * - NO localeCompare (locale-sensitive for non-ASCII)
 * - Simple < > comparison for determinism
 * - Canonical sort key: (start_date, id)
 * - Null/empty dates sort to far future (9999-12-31)
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.3
 */

/**
 * Cohort interface for sorting.
 */
export interface SortableCohort {
  id?: string | number | null;
  name?: string | null;
  start_date?: string | null;
  startDate?: string | null; // Alternative field name
  [key: string]: unknown;
}

/**
 * Far future date for null/empty dates.
 * Ensures cohorts without dates sort last.
 */
const FAR_FUTURE_DATE = '9999-12-31';

/**
 * Deterministic string comparator.
 * Uses simple < > comparison instead of localeCompare.
 *
 * Why not localeCompare?
 * - localeCompare can be locale-sensitive for non-ASCII
 * - Can produce different results in different environments
 * - Simple comparison is deterministic for ASCII dates and IDs
 */
export function cmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Generate canonical sort key for a cohort.
 *
 * Sort key is a tuple: [start_date, id]
 * - start_date: Uses FAR_FUTURE_DATE if null/empty
 * - id: Coerced to string, lowercased for case-insensitive comparison
 *
 * @param cohort - Cohort object with optional id, name, start_date
 * @returns Tuple of [sortableDate, sortableId]
 */
export function cohortSortKey(cohort: SortableCohort): [string, string] {
  // Get date, preferring start_date over startDate
  const rawDate = cohort.start_date ?? cohort.startDate ?? null;
  const date = rawDate || FAR_FUTURE_DATE;

  // Get ID, falling back to name, then empty string
  // Coerce to string to handle numeric IDs
  const rawId = cohort.id ?? cohort.name ?? '';
  const id = String(rawId).toLowerCase();

  return [date, id];
}

/**
 * Compare two cohorts for sorting.
 * Uses canonical sort key with deterministic string comparison.
 *
 * @param a - First cohort
 * @param b - Second cohort
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
export function compareCohorts(a: SortableCohort, b: SortableCohort): number {
  const [aDate, aId] = cohortSortKey(a);
  const [bDate, bId] = cohortSortKey(b);

  // Primary sort: by date
  const dateComparison = cmp(aDate, bDate);
  if (dateComparison !== 0) {
    return dateComparison;
  }

  // Secondary sort: by ID
  return cmp(aId, bId);
}

/**
 * Sort an array of cohorts in canonical order.
 * Returns a new sorted array (does not mutate input).
 *
 * Uses decorate-sort-undecorate pattern for stable sorting:
 * 1. Attach original index to each cohort
 * 2. Sort by (date, id, originalIndex)
 * 3. Return sorted cohorts
 *
 * This ensures deterministic ordering even when date and id are identical.
 *
 * @param cohorts - Array of cohorts to sort
 * @returns New array sorted by canonical key with stable tie-break
 */
export function sortCohorts<T extends SortableCohort>(cohorts: T[]): T[] {
  // Decorate with original index for stable tie-break
  const decorated = cohorts.map((cohort, originalIndex) => ({
    cohort,
    originalIndex,
    key: cohortSortKey(cohort),
  }));

  // Sort by key (date, id) then by originalIndex for stability
  decorated.sort((a, b) => {
    const [aDate, aId] = a.key;
    const [bDate, bId] = b.key;

    // Primary: date
    const dateComparison = cmp(aDate, bDate);
    if (dateComparison !== 0) return dateComparison;

    // Secondary: id
    const idComparison = cmp(aId, bId);
    if (idComparison !== 0) return idComparison;

    // Tertiary: original index (stable tie-break)
    return a.originalIndex - b.originalIndex;
  });

  // Undecorate
  return decorated.map((d) => d.cohort);
}

/**
 * Validate date format is canonical YYYY-MM-DD (zero-padded).
 * Lexicographic comparison only works with zero-padded dates.
 *
 * @param date - Date string to validate
 * @returns true if valid, false if invalid
 */
export function isCanonicalDate(date: string | null | undefined): boolean {
  if (!date) return true; // Empty/null is allowed (sorts to far future)

  // Must match YYYY-MM-DD with zero padding
  const regex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
  return regex.test(date);
}

/**
 * Validate all cohort dates are canonical.
 * Throws if any date is non-canonical.
 *
 * @param cohorts - Array of cohorts to validate
 * @throws Error if any date is non-canonical
 */
export function validateCohortDates(cohorts: SortableCohort[]): void {
  for (const cohort of cohorts) {
    const date = cohort.start_date ?? cohort.startDate;
    if (date && !isCanonicalDate(date)) {
      throw new Error(
        `Non-canonical date format: "${date}". All dates must be YYYY-MM-DD (zero-padded).`
      );
    }
  }
}

/**
 * Sort and validate cohorts.
 * Combines validation and sorting in one call.
 *
 * @param cohorts - Array of cohorts to sort
 * @returns Sorted array
 * @throws Error if any date is non-canonical
 */
export function sortAndValidateCohorts<T extends SortableCohort>(cohorts: T[]): T[] {
  validateCohortDates(cohorts);
  return sortCohorts(cohorts);
}
