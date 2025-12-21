/**
 * Type-safe wrappers for Drizzle ORM query operations
 *
 * These helpers eliminate implicit `any` types from db.query operations
 * by providing explicit type annotations at the call site.
 *
 * @see .claude/WORKFLOW.md - Quality Gate Protocol
 * @see cheatsheets/anti-pattern-prevention.md - Type Safety patterns
 */

import type { InferSelectModel, Table } from 'drizzle-orm';

/**
 * Type-safe wrapper for findFirst operations
 *
 * @example
 * ```typescript
 * import { forecastSnapshots } from '@shared/schema';
 *
 * const snapshot = await typedFindFirst<typeof forecastSnapshots>(
 *   db.query.forecastSnapshots.findFirst({
 *     where: eq(forecastSnapshots.id, snapshotId)
 *   })
 * );
 * // Type: ForecastSnapshot | undefined
 * ```
 */
export function typedFindFirst<T extends Table>(
  query: Promise<InferSelectModel<T> | undefined>
): Promise<InferSelectModel<T> | undefined> {
  return query;
}

/**
 * Type-safe wrapper for findMany operations
 *
 * @example
 * ```typescript
 * import { investmentLots } from '@shared/schema';
 *
 * const lots = await typedFindMany<typeof investmentLots>(
 *   db.query.investmentLots.findMany({
 *     where: eq(investmentLots.investmentId, investmentId)
 *   })
 * );
 * // Type: InvestmentLot[]
 * ```
 */
export function typedFindMany<T extends Table>(
  query: Promise<InferSelectModel<T>[]>
): Promise<InferSelectModel<T>[]> {
  return query;
}

/**
 * Type-safe wrapper for insert operations
 *
 * @example
 * ```typescript
 * import { investmentLots } from '@shared/schema';
 *
 * const [newLot] = await typedInsert<typeof investmentLots>(
 *   db.insert(investmentLots)
 *     .values(lotData)
 *     .returning()
 * );
 * // Type: InvestmentLot
 * ```
 */
export function typedInsert<T extends Table>(
  query: Promise<InferSelectModel<T>[]>
): Promise<InferSelectModel<T>[]> {
  return query;
}

/**
 * Type-safe wrapper for update operations
 *
 * @example
 * ```typescript
 * import { forecastSnapshots } from '@shared/schema';
 *
 * const [updated] = await typedUpdate<typeof forecastSnapshots>(
 *   db.update(forecastSnapshots)
 *     .set({ status: 'active' })
 *     .where(eq(forecastSnapshots.id, id))
 *     .returning()
 * );
 * // Type: ForecastSnapshot
 * ```
 */
export function typedUpdate<T extends Table>(
  query: Promise<InferSelectModel<T>[]>
): Promise<InferSelectModel<T>[]> {
  return query;
}
