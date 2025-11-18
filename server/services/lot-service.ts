/**
 * Lot Service
 *
 * Handles investment lot operations including creation and listing.
 * Uses database-level idempotency and validates cost basis calculations.
 *
 * Version: 1.0.0 (Phase 0-ALPHA)
 * Created: 2025-11-10
 *
 * @module server/services/lot-service
 */

import type { InvestmentLot } from '@shared/schema';

// =====================
// TYPE DEFINITIONS
// =====================

/**
 * Create lot request data
 */
export interface CreateLotData {
  investmentId: number;
  lotType: 'initial' | 'follow_on' | 'secondary';
  sharePriceCents: bigint;
  sharesAcquired: string; // decimal as string (precision 18, scale 8)
  costBasisCents: bigint;
  idempotencyKey?: string | null;
}

/**
 * List lots filter
 */
export interface ListLotsFilter {
  cursor?: string;
  limit?: number;
  investmentId?: number;
  lotType?: 'initial' | 'follow_on' | 'secondary';
}

/**
 * Paginated lots result
 */
export interface PaginatedLots {
  lots: InvestmentLot[];
  nextCursor?: string;
  hasMore: boolean;
}

// =====================
// ERROR CLASSES
// =====================

/**
 * Error thrown when lot is not found
 */
export class LotNotFoundError extends Error {
  constructor(lotId: string) {
    super(`Lot not found: ${lotId}`);
    this.name = 'LotNotFoundError';
  }
}

/**
 * Error thrown when investment is not found
 */
export class InvestmentNotFoundError extends Error {
  constructor(investmentId: number) {
    super(`Investment not found: ${investmentId}`);
    this.name = 'InvestmentNotFoundError';
  }
}

/**
 * Error thrown when investment does not belong to specified fund
 */
export class InvestmentFundMismatchError extends Error {
  constructor(investmentId: number, fundId: number) {
    super(`Investment ${investmentId} does not belong to fund ${fundId}`);
    this.name = 'InvestmentFundMismatchError';
  }
}

/**
 * Error thrown when cost basis calculation is incorrect
 */
export class CostBasisMismatchError extends Error {
  constructor(
    expected: bigint,
    actual: bigint,
    sharePriceCents: bigint,
    sharesAcquired: string
  ) {
    super(
      `Cost basis mismatch: expected ${expected}, got ${actual} ` +
        `(sharePriceCents=${sharePriceCents}, sharesAcquired=${sharesAcquired})`
    );
    this.name = 'CostBasisMismatchError';
  }
}

// =====================
// SERVICE CLASS
// =====================

/**
 * LotService
 *
 * Provides methods for managing investment lots with:
 * - Database-level idempotency
 * - Cost basis validation
 * - Parent entity validation (investment belongs to fund)
 * - Cursor-based pagination
 *
 * @example
 * const service = new LotService();
 * const lot = await service.create(1, {
 *   investmentId: 5,
 *   lotType: 'follow_on',
 *   sharePriceCents: BigInt(250000),
 *   sharesAcquired: '1000.00000000',
 *   costBasisCents: BigInt(250000000),
 *   idempotencyKey: 'unique-key',
 * });
 */
export class LotService {
  /**
   * Create a new investment lot
   *
   * Creates a lot with validation:
   * 1. Investment exists and belongs to specified fund (security)
   * 2. Cost basis matches calculation (sharePriceCents * sharesAcquired)
   * 3. Database-level idempotency via unique index on (investmentId, idempotencyKey)
   *
   * @param fundId - Fund ID (for security validation)
   * @param data - Lot creation data
   * @returns Created lot
   * @throws InvestmentNotFoundError if investment does not exist
   * @throws InvestmentFundMismatchError if investment does not belong to fund
   * @throws CostBasisMismatchError if cost basis validation fails
   * @throws Error if idempotency key collision with different data
   *
   * @example
   * const lot = await service.create(1, {
   *   investmentId: 5,
   *   lotType: 'initial',
   *   sharePriceCents: BigInt(100000), // $1.00/share
   *   sharesAcquired: '1000000.00000000', // 1M shares
   *   costBasisCents: BigInt(100000000), // $1M
   *   idempotencyKey: 'key123',
   * });
   */
  async create(fundId: number, data: CreateLotData): Promise<InvestmentLot> {
    throw new Error('Not implemented: LotService.create()');
  }

  /**
   * List lots for a fund with pagination
   *
   * Returns lots ordered by createdAt DESC, with cursor-based pagination.
   * Supports filtering by investmentId and lotType.
   *
   * @param fundId - Fund ID
   * @param filter - List filter options
   * @returns Paginated lots result
   *
   * @example
   * const result = await service.list(1, {
   *   investmentId: 5,
   *   lotType: 'follow_on',
   *   limit: 20,
   * });
   * console.log(result.lots); // Max 20 items
   * console.log(result.hasMore); // true if more results available
   */
  async list(fundId: number, filter: ListLotsFilter): Promise<PaginatedLots> {
    throw new Error('Not implemented: LotService.list()');
  }

  // =====================
  // PRIVATE HELPERS
  // =====================

  /**
   * Validate cost basis calculation
   *
   * Ensures costBasisCents = sharePriceCents * sharesAcquired (with tolerance for rounding)
   * Tolerance: 1 cent per share maximum
   *
   * @param sharePriceCents - Share price in cents
   * @param sharesAcquired - Shares acquired (decimal string)
   * @param costBasisCents - Cost basis in cents
   * @throws CostBasisMismatchError if validation fails
   */
  private validateCostBasis(
    sharePriceCents: bigint,
    sharesAcquired: string,
    costBasisCents: bigint
  ): void {
    // TODO: Implement validation logic
    throw new Error(
      `Not implemented: validateCostBasis(${sharePriceCents}, ${sharesAcquired}, ${costBasisCents})`
    );
  }

  /**
   * Verify investment exists and belongs to fund
   *
   * @param investmentId - Investment ID
   * @param fundId - Fund ID
   * @throws InvestmentNotFoundError if investment does not exist
   * @throws InvestmentFundMismatchError if investment does not belong to fund
   */
  private async verifyInvestmentBelongsToFund(
    investmentId: number,
    fundId: number
  ): Promise<void> {
    // TODO: Implement database query
    throw new Error(
      `Not implemented: verifyInvestmentBelongsToFund(${investmentId}, ${fundId})`
    );
  }

  /**
   * Calculate cost basis from share price and shares acquired
   *
   * Uses BigInt arithmetic to avoid precision loss with decimal numbers.
   * The sharesAcquired string has up to 8 decimal places (precision 18, scale 8).
   *
   * Algorithm:
   * 1. Split sharesAcquired into integer and fractional parts
   * 2. Multiply integer part by sharePriceCents (exact BigInt math)
   * 3. Multiply fractional part by sharePriceCents (scaled by 10^8)
   * 4. Combine and round to nearest cent
   *
   * @param sharePriceCents - Share price in cents
   * @param sharesAcquired - Shares acquired (decimal string, max 8 decimals)
   * @returns Cost basis in cents (rounded to nearest cent)
   */
  private calculateCostBasis(sharePriceCents: bigint, sharesAcquired: string): bigint {
    // Split into integer and fractional parts
    const [integerPart = '0', fractionalPart = '0'] = sharesAcquired.split('.');

    // Convert integer part to BigInt and multiply
    const integerShares = BigInt(integerPart);
    const integerCostCents = sharePriceCents * integerShares;

    // Handle fractional part (up to 8 decimal places)
    // Pad fractional part to exactly 8 digits (e.g., "12345678" or "1" -> "10000000")
    const paddedFractional = fractionalPart.padEnd(8, '0').slice(0, 8);
    const fractionalShares = BigInt(paddedFractional);

    // Calculate fractional cost: (sharePriceCents * fractionalShares) / 10^8
    // This gives us the fractional cents, which we'll need to round
    const fractionalCostScaled = sharePriceCents * fractionalShares;

    // Divide by 10^8 to get fractional cents, rounding to nearest cent
    // We add 5*10^7 before dividing to round to nearest (banker's rounding)
    const SCALE = BigInt(100_000_000); // 10^8
    const ROUNDING_FACTOR = SCALE / BigInt(2); // 5*10^7 for rounding

    const fractionalCostCents = (fractionalCostScaled + ROUNDING_FACTOR) / SCALE;

    // Combine integer and fractional costs
    return integerCostCents + fractionalCostCents;
  }

  /**
   * Encode cursor for pagination
   *
   * @param timestamp - Created timestamp
   * @param id - Lot ID
   * @returns Base64-encoded cursor
   */
  private encodeCursor(timestamp: Date, id: string): string {
    return Buffer.from(JSON.stringify({ timestamp: timestamp.toISOString(), id })).toString(
      'base64'
    );
  }

  /**
   * Decode cursor for pagination
   *
   * @param cursor - Base64-encoded cursor
   * @returns Decoded timestamp and ID
   */
  private decodeCursor(cursor: string): { timestamp: Date; id: string } {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      return {
        timestamp: new Date(decoded.timestamp),
        id: decoded.id,
      };
    } catch {
      throw new Error(`Invalid cursor format`);
    }
  }
}
