/**
 * Portfolio Route API Request/Response Schemas
 *
 * This file defines the complete input/output contracts for the Portfolio Management API
 * endpoints, including investment lots and forecast snapshots. All schemas use Zod for
 * validation and follow the established patterns from the codebase.
 *
 * Version: 1.0.0
 * Created: 2025-11-08
 *
 * @module shared/schemas/portfolio-route
 */

import { z } from 'zod';

// =====================
// REUSABLE SCHEMAS
// =====================

/**
 * Defensive BigInt schema for cent-denominated values.
 * Prevents silent coercion of invalid inputs like "123.45", "abc", "Infinity".
 * Requires non-negative integer strings only.
 */
const BigIntCentsSchema = z
  .string()
  .regex(/^\d+$/, 'Must be non-negative integer string')
  .transform((s) => BigInt(s))
  .pipe(z.bigint().min(0n));

// =====================
// REUSABLE ENUMS
// =====================

/**
 * Investment lot type enum
 * - initial: First investment in a company
 * - follow_on: Subsequent investment in existing portfolio company
 * - secondary: Purchase of existing shares from other shareholders
 */
export const LotTypeEnum = z.enum(['initial', 'follow_on', 'secondary']);
export type LotType = z.infer<typeof LotTypeEnum>;

/**
 * Forecast snapshot status enum
 * - pending: Snapshot created, awaiting calculation worker pickup
 * - calculating: Calculation in progress
 * - complete: Calculation finished successfully
 * - error: Calculation failed
 */
export const SnapshotStatusEnum = z.enum(['pending', 'calculating', 'complete', 'error']);
export type SnapshotStatus = z.infer<typeof SnapshotStatusEnum>;

// =====================
// ENTITY SCHEMAS (Database Row Representations)
// =====================

/**
 * Investment Lot V1 Schema
 * Represents a specific purchase lot of shares in a portfolio company
 *
 * Corresponds to database table: investment_lots
 */
export const InvestmentLotV1Schema = z.object({
  id: z.string().uuid(),
  investmentId: z.number().int().positive(),

  lotType: LotTypeEnum,
  sharePriceCents: BigIntCentsSchema.describe('Share price in cents (BigInt)'),
  sharesAcquired: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/)
    .describe('Shares acquired (decimal as string, precision 18, scale 8)'),
  costBasisCents: BigIntCentsSchema.describe('Total cost basis in cents (BigInt)'),

  version: z.number().int().min(1).describe('Optimistic locking version'),
  idempotencyKey: z
    .string()
    .uuid()
    .nullable()
    .describe('Optional idempotency key for duplicate prevention'),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type InvestmentLotV1 = z.infer<typeof InvestmentLotV1Schema>;

/**
 * Forecast Snapshot V1 Schema
 * Represents a point-in-time snapshot of fund forecast with async calculation status
 *
 * Corresponds to database table: forecast_snapshots
 */
export const ForecastSnapshotV1Schema = z.object({
  id: z.string().uuid(),
  fundId: z.number().int().positive(),

  name: z.string().min(1).max(255).describe('Human-readable snapshot name'),
  status: SnapshotStatusEnum,
  sourceHash: z.string().nullable().describe('Hash of input data for deduplication'),
  calculatedMetrics: z.record(z.unknown()).nullable().describe('Calculated metrics (JSONB)'),

  fundState: z.record(z.unknown()).nullable().describe('Fund configuration state (JSONB)'),
  portfolioState: z.record(z.unknown()).nullable().describe('Portfolio holdings state (JSONB)'),
  metricsState: z.record(z.unknown()).nullable().describe('Performance metrics state (JSONB)'),

  snapshotTime: z.coerce.date().describe('When snapshot was captured'),
  version: z.number().int().min(1).describe('Optimistic locking version'),
  idempotencyKey: z
    .string()
    .uuid()
    .nullable()
    .describe('Optional idempotency key for duplicate prevention'),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ForecastSnapshotV1 = z.infer<typeof ForecastSnapshotV1Schema>;

/**
 * Reserve Allocation V1 Schema
 * Links reserve allocation decisions to snapshots
 *
 * Corresponds to database table: reserve_allocations
 */
export const ReserveAllocationV1Schema = z.object({
  id: z.string().uuid(),
  snapshotId: z.string().uuid(),
  companyId: z.number().int().positive(),

  plannedReserveCents: BigIntCentsSchema.describe('Planned reserve allocation in cents (BigInt)'),
  allocationScore: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/)
    .nullable()
    .describe('Allocation score (decimal as string, precision 10, scale 6)'),
  priority: z.number().int().nullable().describe('Allocation priority rank'),
  rationale: z.string().nullable().describe('Explanation for allocation decision'),

  version: z.number().int().min(1).describe('Optimistic locking version'),
  idempotencyKey: z
    .string()
    .uuid()
    .nullable()
    .describe('Optional idempotency key for duplicate prevention'),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ReserveAllocationV1 = z.infer<typeof ReserveAllocationV1Schema>;

// =====================
// PAGINATION SCHEMAS
// =====================

/**
 * Cursor-based pagination request schema
 * Follows best practices: cursor (not offset/limit), configurable limit with max
 */
export const PaginationRequestSchema = z.object({
  cursor: z.string().optional().describe('Cursor from previous page (typically UUID or ID)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Number of results to return (default: 20, max: 100)'),
});
export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;

/**
 * Cursor-based pagination response schema
 */
export const PaginationResponseSchema = z.object({
  nextCursor: z.string().optional().describe('Cursor for next page (absent if no more results)'),
  hasMore: z.boolean().describe('True if more results are available'),
});
export type PaginationResponse = z.infer<typeof PaginationResponseSchema>;

// =====================
// ENDPOINT 1: POST /api/funds/:fundId/portfolio/snapshots (202 Accepted)
// =====================

/**
 * Create Snapshot Request Schema
 * Initiates async snapshot calculation
 */
export const CreateSnapshotRequestSchema = z
  .object({
    name: z.string().min(1).max(255).describe('Human-readable snapshot name'),
    idempotencyKey: z
      .string()
      .uuid()
      .optional()
      .describe('Optional idempotency key for duplicate prevention'),
  })
  .strict();
export type CreateSnapshotRequest = z.infer<typeof CreateSnapshotRequestSchema>;

/**
 * Create Snapshot Response Schema (202 Accepted)
 * Returns snapshot ID and polling information
 */
export const CreateSnapshotResponseSchema = z.object({
  snapshotId: z.string().uuid().describe('Unique identifier for created snapshot'),
  status: z.enum(['pending', 'calculating']).describe('Initial snapshot status'),
  statusUrl: z.string().url().describe('Polling endpoint URL to check calculation progress'),
  retryAfter: z.number().int().positive().describe('Recommended retry interval in seconds'),
});
export type CreateSnapshotResponse = z.infer<typeof CreateSnapshotResponseSchema>;

// =====================
// ENDPOINT 2: GET /api/funds/:fundId/portfolio/snapshots (cursor pagination)
// =====================

/**
 * List Snapshots Request Schema (Query Parameters)
 */
export const ListSnapshotsRequestSchema = PaginationRequestSchema.extend({
  status: SnapshotStatusEnum.optional().describe('Filter by snapshot status'),
}).strict();
export type ListSnapshotsRequest = z.infer<typeof ListSnapshotsRequestSchema>;

/**
 * List Snapshots Response Schema
 */
export const ListSnapshotsResponseSchema = z.object({
  snapshots: z.array(ForecastSnapshotV1Schema).describe('Array of forecast snapshots'),
  pagination: PaginationResponseSchema,
});
export type ListSnapshotsResponse = z.infer<typeof ListSnapshotsResponseSchema>;

// =====================
// ENDPOINT 3: GET /api/snapshots/:snapshotId (status polling)
// =====================

/**
 * Snapshot Status Response Schema
 * Used for polling calculation progress
 */
export const SnapshotStatusResponseSchema = z.object({
  snapshot: ForecastSnapshotV1Schema,
  progress: z
    .object({
      current: z.number().int().min(0).describe('Current progress step'),
      total: z.number().int().positive().describe('Total steps in calculation'),
    })
    .optional()
    .describe('Calculation progress (only present when status is "calculating")'),
  retryAfter: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Recommended retry interval in seconds (only present when still calculating)'),
});
export type SnapshotStatusResponse = z.infer<typeof SnapshotStatusResponseSchema>;

// =====================
// ENDPOINT 4: POST /api/funds/:fundId/portfolio/lots (idempotent)
// =====================

/**
 * Create Lot Request Schema
 * Creates a new investment lot with idempotency support
 */
export const CreateLotRequestSchema = z
  .object({
    investmentId: z.number().int().positive().describe('ID of the investment this lot belongs to'),
    lotType: LotTypeEnum,
    sharePriceCents: BigIntCentsSchema.describe('Share price in cents (BigInt)'),
    sharesAcquired: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .describe('Number of shares acquired (decimal as string, max 8 decimal places)'),
    costBasisCents: BigIntCentsSchema.describe('Total cost basis in cents (BigInt)'),
    idempotencyKey: z
      .string()
      .uuid()
      .optional()
      .describe('Optional idempotency key for duplicate prevention'),
  })
  .strict()
  .refine(
    (data) => {
      // Validate that costBasisCents is approximately equal to sharePriceCents * sharesAcquired
      // Allow for small rounding differences (< 1 cent per share)
      const shares = parseFloat(data.sharesAcquired);
      const expectedCost = BigInt(Math.round(Number(data.sharePriceCents) * shares));
      const actualCost = data.costBasisCents;
      const tolerance = BigInt(Math.ceil(shares)); // 1 cent per share tolerance
      return actualCost >= expectedCost - tolerance && actualCost <= expectedCost + tolerance;
    },
    {
      message: 'costBasisCents must be approximately equal to sharePriceCents * sharesAcquired',
    }
  );
export type CreateLotRequest = z.infer<typeof CreateLotRequestSchema>;

/**
 * Create Lot Response Schema
 * Returns created lot and indicates if it was a duplicate
 */
export const CreateLotResponseSchema = z.object({
  lot: InvestmentLotV1Schema,
  created: z
    .boolean()
    .describe('True if lot was newly created, false if duplicate (same idempotencyKey)'),
});
export type CreateLotResponse = z.infer<typeof CreateLotResponseSchema>;

// =====================
// ENDPOINT 5: GET /api/funds/:fundId/portfolio/lots (filtering)
// =====================

/**
 * List Lots Request Schema (Query Parameters)
 */
export const ListLotsRequestSchema = PaginationRequestSchema.extend({
  investmentId: z.number().int().positive().optional().describe('Filter by investment ID'),
  lotType: LotTypeEnum.optional().describe('Filter by lot type'),
}).strict();
export type ListLotsRequest = z.infer<typeof ListLotsRequestSchema>;

/**
 * List Lots Response Schema
 */
export const ListLotsResponseSchema = z.object({
  lots: z.array(InvestmentLotV1Schema).describe('Array of investment lots'),
  pagination: PaginationResponseSchema,
});
export type ListLotsResponse = z.infer<typeof ListLotsResponseSchema>;

// =====================
// ENDPOINT 6: PUT /api/snapshots/:snapshotId (optimistic locking)
// =====================

/**
 * Update Snapshot Request Schema
 * Updates snapshot with optimistic locking
 */
export const UpdateSnapshotRequestSchema = z
  .object({
    name: z.string().min(1).max(255).optional().describe('Updated snapshot name'),
    status: SnapshotStatusEnum.optional().describe('Updated snapshot status'),
    calculatedMetrics: z
      .record(z.unknown())
      .optional()
      .describe('Updated calculated metrics (JSONB)'),
    version: z.number().int().min(1).describe('Expected version for optimistic locking (required)'),
  })
  .strict();
export type UpdateSnapshotRequest = z.infer<typeof UpdateSnapshotRequestSchema>;

/**
 * Update Snapshot Response Schema
 */
export const UpdateSnapshotResponseSchema = z.object({
  snapshot: ForecastSnapshotV1Schema,
  updated: z.boolean().describe('True if update succeeded, false if version mismatch'),
});
export type UpdateSnapshotResponse = z.infer<typeof UpdateSnapshotResponseSchema>;

// =====================
// VALIDATION UTILITIES
// =====================

/**
 * Validate create snapshot request
 * @throws {z.ZodError} If validation fails
 */
export function validateCreateSnapshotRequest(data: unknown): CreateSnapshotRequest {
  return CreateSnapshotRequestSchema.parse(data);
}

/**
 * Validate list snapshots request
 * @throws {z.ZodError} If validation fails
 */
export function validateListSnapshotsRequest(data: unknown): ListSnapshotsRequest {
  return ListSnapshotsRequestSchema.parse(data);
}

/**
 * Validate create lot request
 * @throws {z.ZodError} If validation fails
 */
export function validateCreateLotRequest(data: unknown): CreateLotRequest {
  return CreateLotRequestSchema.parse(data);
}

/**
 * Validate list lots request
 * @throws {z.ZodError} If validation fails
 */
export function validateListLotsRequest(data: unknown): ListLotsRequest {
  return ListLotsRequestSchema.parse(data);
}

/**
 * Validate update snapshot request
 * @throws {z.ZodError} If validation fails
 */
export function validateUpdateSnapshotRequest(data: unknown): UpdateSnapshotRequest {
  return UpdateSnapshotRequestSchema.parse(data);
}

// =====================
// HELPER FUNCTIONS
// =====================

/**
 * Convert BigInt to JSON-safe string representation
 * Use this when serializing BigInt fields for JSON responses
 */
export function serializeBigInt(value: bigint): string {
  return value.toString();
}

/**
 * Parse BigInt from string
 * Use this when deserializing BigInt fields from JSON requests
 */
export function parseBigInt(value: string): bigint {
  return BigInt(value);
}

/**
 * Calculate cost basis from shares and price
 * Helper for creating lots with correct cost basis
 */
export function calculateCostBasis(sharePriceCents: bigint, sharesAcquired: string): bigint {
  const shares = parseFloat(sharesAcquired);
  return BigInt(Math.round(Number(sharePriceCents) * shares));
}

// ============================================================================
// STATUS TRANSITION VALIDATION
// ============================================================================

/**
 * Valid status transitions for forecast snapshots.
 * Prevents backwards transitions and enforces monotonic progression:
 * pending → calculating → complete/error
 */
export const StatusTransitions: Record<SnapshotStatus, readonly SnapshotStatus[]> = {
  pending: ['calculating', 'error'],
  calculating: ['complete', 'error'],
  complete: [], // Terminal state
  error: [], // Terminal state
} as const;

export type StatusTransition = typeof StatusTransitions;

/**
 * Validates that a status transition is allowed.
 *
 * @param currentStatus - Current snapshot status
 * @param newStatus - Requested new status
 * @returns true if transition is valid, false otherwise
 *
 * @example
 * validateStatusTransition('pending', 'calculating') // true
 * validateStatusTransition('complete', 'pending')    // false
 */
export function validateStatusTransition(
  currentStatus: SnapshotStatus,
  newStatus: SnapshotStatus
): boolean {
  return (StatusTransitions[currentStatus] as readonly SnapshotStatus[]).includes(newStatus);
}
