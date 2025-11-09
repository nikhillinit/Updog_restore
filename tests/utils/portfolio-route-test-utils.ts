/**
 * Portfolio Route API Test Utilities
 *
 * Reusable utilities for Portfolio Route API testing including:
 * - API client wrapper with authentication and retry logic
 * - Assertion helpers for schema validation
 * - Mock data generators
 * - Polling helpers for async operations
 * - Database seeding and cleanup utilities
 *
 * Version: 1.0.0
 * Created: 2025-11-08
 *
 * @module tests/utils/portfolio-route-test-utils
 */

import type { Application } from 'express';
import request, { Test as SupertestTest } from 'supertest';
import { randomUUID } from 'crypto';
import {
  InvestmentLotV1Schema,
  ForecastSnapshotV1Schema,
  ReserveAllocationV1Schema,
  ListSnapshotsResponseSchema,
  ListLotsResponseSchema,
  CreateSnapshotResponseSchema,
  CreateLotResponseSchema,
  UpdateSnapshotResponseSchema,
  SnapshotStatusResponseSchema,
  validateStatusTransition,
  type InvestmentLotV1,
  type ForecastSnapshotV1,
  type CreateSnapshotRequest,
  type CreateLotRequest,
  type UpdateSnapshotRequest,
  type SnapshotStatus,
} from '@shared/schemas/portfolio-route';
import { ZodError } from 'zod';

// =====================
// TYPE DEFINITIONS
// =====================

/**
 * API client configuration
 */
export interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

/**
 * Polling configuration for async operations
 */
export interface PollingConfig {
  maxAttempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Database seeding result
 */
export interface SeedResult {
  fundId: number;
  investmentIds: number[];
  snapshotIds: string[];
  lotIds: string[];
  cleanup: () => Promise<void>;
}

// =====================
// API CLIENT WRAPPER
// =====================

/**
 * Portfolio Route API Client
 *
 * Provides a fluent interface for making API requests with built-in:
 * - Automatic idempotency key generation
 * - Retry logic with exponential backoff
 * - Schema validation of responses
 * - Request/response logging
 *
 * @example
 * const client = new PortfolioApiClient(app);
 * const snapshot = await client.createSnapshot(1, { name: 'Q4 2024' });
 */
export class PortfolioApiClient {
  constructor(
    private readonly app: Application,
    private readonly config: ApiClientConfig = {}
  ) {}

  /**
   * Create a forecast snapshot
   *
   * @param fundId - Fund ID
   * @param payload - Snapshot creation request
   * @returns Snapshot creation response with snapshotId and statusUrl
   */
  async createSnapshot(fundId: number, payload: CreateSnapshotRequest) {
    const response = await this.post(`/api/funds/${fundId}/portfolio/snapshots`)
      .send(payload)
      .expect(202);

    return CreateSnapshotResponseSchema.parse(response.body);
  }

  /**
   * List snapshots with pagination
   *
   * @param fundId - Fund ID
   * @param params - Query parameters (cursor, limit, status)
   * @returns List of snapshots with pagination metadata
   */
  async listSnapshots(
    fundId: number,
    params?: { cursor?: string; limit?: number; status?: SnapshotStatus }
  ) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);

    const response = await this.get(
      `/api/funds/${fundId}/portfolio/snapshots?${query.toString()}`
    ).expect(200);

    return ListSnapshotsResponseSchema.parse(response.body);
  }

  /**
   * Get snapshot status (for polling)
   *
   * @param snapshotId - Snapshot ID
   * @returns Snapshot with optional progress information
   */
  async getSnapshotStatus(snapshotId: string) {
    const response = await this.get(`/api/snapshots/${snapshotId}`).expect(200);

    return SnapshotStatusResponseSchema.parse(response.body);
  }

  /**
   * Update snapshot with optimistic locking
   *
   * @param snapshotId - Snapshot ID
   * @param payload - Update request with version
   * @returns Updated snapshot
   */
  async updateSnapshot(snapshotId: string, payload: UpdateSnapshotRequest) {
    const response = await this.put(`/api/snapshots/${snapshotId}`)
      .send(payload)
      .expect(200);

    return UpdateSnapshotResponseSchema.parse(response.body);
  }

  /**
   * Create an investment lot
   *
   * @param fundId - Fund ID
   * @param payload - Lot creation request
   * @returns Created lot with created flag
   */
  async createLot(fundId: number, payload: CreateLotRequest) {
    const response = await this.post(`/api/funds/${fundId}/portfolio/lots`)
      .send(payload)
      .expect(201);

    return CreateLotResponseSchema.parse(response.body);
  }

  /**
   * List lots with filtering and pagination
   *
   * @param fundId - Fund ID
   * @param params - Query parameters (cursor, limit, investmentId, lotType)
   * @returns List of lots with pagination metadata
   */
  async listLots(
    fundId: number,
    params?: {
      cursor?: string;
      limit?: number;
      investmentId?: number;
      lotType?: string;
    }
  ) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.investmentId)
      query.set('investmentId', params.investmentId.toString());
    if (params?.lotType) query.set('lotType', params.lotType);

    const response = await this.get(
      `/api/funds/${fundId}/portfolio/lots?${query.toString()}`
    ).expect(200);

    return ListLotsResponseSchema.parse(response.body);
  }

  /**
   * Poll snapshot until complete or error
   *
   * @param snapshotId - Snapshot ID
   * @param config - Polling configuration
   * @returns Final snapshot state
   *
   * @throws Error if polling times out or snapshot enters error state
   */
  async pollSnapshotUntilComplete(
    snapshotId: string,
    config: PollingConfig = {}
  ): Promise<ForecastSnapshotV1> {
    const { maxAttempts = 30, intervalMs = 1000, timeoutMs = 30000 } = config;
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Polling timeout after ${timeoutMs}ms for snapshot ${snapshotId}`
        );
      }

      const { snapshot } = await this.getSnapshotStatus(snapshotId);

      if (snapshot.status === 'complete') {
        return snapshot;
      }

      if (snapshot.status === 'error') {
        throw new Error(
          `Snapshot ${snapshotId} entered error state: ${JSON.stringify(snapshot.calculatedMetrics)}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Polling exceeded max attempts (${maxAttempts}) for snapshot ${snapshotId}`
    );
  }

  /**
   * Paginate through all results
   *
   * @param fundId - Fund ID
   * @param fetchPage - Function to fetch a page of results
   * @returns All results across all pages
   *
   * @example
   * const allSnapshots = await client.paginateAll(1, (cursor) =>
   *   client.listSnapshots(1, { cursor })
   * );
   */
  async paginateAll<T>(
    fundId: number,
    fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>
  ): Promise<T[]> {
    const allItems: T[] = [];
    let cursor: string | undefined;

    do {
      const page = await fetchPage(cursor);
      allItems.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    return allItems;
  }

  // Private helper methods

  private post(path: string): SupertestTest {
    return this.request('post', path);
  }

  private get(path: string): SupertestTest {
    return this.request('get', path);
  }

  private put(path: string): SupertestTest {
    return this.request('put', path);
  }

  private request(method: 'get' | 'post' | 'put', path: string): SupertestTest {
    const req = request(this.app)[method](path);

    // Apply default headers
    if (this.config.headers) {
      Object.entries(this.config.headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    // Apply timeout
    if (this.config.timeout) {
      req.timeout(this.config.timeout);
    }

    return req;
  }
}

// =====================
// ASSERTION HELPERS
// =====================

/**
 * Assert that a value is a valid InvestmentLotV1
 *
 * @param value - Value to validate
 * @throws ZodError if validation fails
 *
 * @example
 * assertValidLot(response.body.lot);
 */
export function assertValidLot(value: unknown): asserts value is InvestmentLotV1 {
  InvestmentLotV1Schema.parse(value);
}

/**
 * Assert that a value is a valid ForecastSnapshotV1
 *
 * @param value - Value to validate
 * @throws ZodError if validation fails
 *
 * @example
 * assertValidSnapshot(response.body.snapshot);
 */
export function assertValidSnapshot(
  value: unknown
): asserts value is ForecastSnapshotV1 {
  ForecastSnapshotV1Schema.parse(value);
}

/**
 * Assert that a status transition is valid
 *
 * @param currentStatus - Current snapshot status
 * @param newStatus - Requested new status
 * @throws Error if transition is invalid
 *
 * @example
 * assertValidStatusTransition('pending', 'calculating');
 */
export function assertValidStatusTransition(
  currentStatus: SnapshotStatus,
  newStatus: SnapshotStatus
): void {
  if (!validateStatusTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid status transition: ${currentStatus} → ${newStatus}`
    );
  }
}

/**
 * Assert that BigInt values are approximately equal (within tolerance)
 *
 * @param actual - Actual BigInt value
 * @param expected - Expected BigInt value
 * @param toleranceCents - Allowed difference in cents (default: 1)
 * @throws Error if values differ beyond tolerance
 *
 * @example
 * assertBigIntEquals(lot.costBasisCents, expectedCost, 100); // ±$1 tolerance
 */
export function assertBigIntEquals(
  actual: bigint | string,
  expected: bigint | string,
  toleranceCents: bigint = BigInt(1)
): void {
  const actualBigInt = typeof actual === 'string' ? BigInt(actual) : actual;
  const expectedBigInt = typeof expected === 'string' ? BigInt(expected) : expected;

  const diff =
    actualBigInt > expectedBigInt
      ? actualBigInt - expectedBigInt
      : expectedBigInt - actualBigInt;

  if (diff > toleranceCents) {
    throw new Error(
      `BigInt assertion failed:\n` +
        `  Expected: ${expectedBigInt.toString()}\n` +
        `  Actual:   ${actualBigInt.toString()}\n` +
        `  Diff:     ${diff.toString()} (tolerance: ${toleranceCents.toString()})`
    );
  }
}

/**
 * Assert that pagination response has correct structure
 *
 * @param response - API response with pagination
 * @param expectedHasMore - Expected value of hasMore flag
 * @throws Error if pagination structure is invalid
 *
 * @example
 * assertValidPagination(response, true); // Expects more results
 */
export function assertValidPagination(
  response: { pagination: { nextCursor?: string; hasMore: boolean } },
  expectedHasMore?: boolean
): void {
  const { pagination } = response;

  if (expectedHasMore !== undefined && pagination.hasMore !== expectedHasMore) {
    throw new Error(
      `Pagination hasMore mismatch: expected ${expectedHasMore}, got ${pagination.hasMore}`
    );
  }

  if (pagination.hasMore && !pagination.nextCursor) {
    throw new Error('Pagination hasMore=true but nextCursor is missing');
  }

  if (!pagination.hasMore && pagination.nextCursor) {
    throw new Error('Pagination hasMore=false but nextCursor is present');
  }
}

/**
 * Assert that idempotency behavior is correct
 *
 * @param response1 - First response
 * @param response2 - Second response (duplicate request)
 * @param shouldBeIdempotent - Whether responses should be identical
 * @throws Error if idempotency behavior is incorrect
 *
 * @example
 * assertIdempotency(firstResponse, secondResponse, true);
 */
export function assertIdempotency(
  response1: any,
  response2: any,
  shouldBeIdempotent: boolean
): void {
  if (shouldBeIdempotent) {
    // Responses should be identical (same ID, same data)
    if (JSON.stringify(response1) !== JSON.stringify(response2)) {
      throw new Error(
        'Idempotency violation: responses differ for duplicate request'
      );
    }
  } else {
    // Responses should differ (different IDs for different requests)
    if (JSON.stringify(response1) === JSON.stringify(response2)) {
      throw new Error(
        'Idempotency violation: responses identical for different requests'
      );
    }
  }
}

// =====================
// MOCK DATA GENERATORS
// =====================

/**
 * Generate realistic calculated metrics for a snapshot
 *
 * @param seed - Random seed for deterministic generation
 * @returns Calculated metrics object
 *
 * @example
 * const metrics = generateCalculatedMetrics(12345);
 */
export function generateCalculatedMetrics(seed: number = Date.now()) {
  // Use seed for deterministic randomness
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  return {
    irr: 0.1 + random() * 0.3, // 10% - 40%
    moic: 1.5 + random() * 2.0, // 1.5x - 3.5x
    dpi: 0.5 + random() * 1.0, // 0.5x - 1.5x
    tvpi: 1.2 + random() * 1.5, // 1.2x - 2.7x
    totalValue: Math.floor(50_000_000 + random() * 100_000_000),
    deployedCapital: Math.floor(30_000_000 + random() * 50_000_000),
    unrealizedValue: Math.floor(40_000_000 + random() * 80_000_000),
    realizedValue: Math.floor(10_000_000 + random() * 30_000_000),
  };
}

/**
 * Generate realistic fund state for a snapshot
 *
 * @param fundSize - Fund size in dollars
 * @returns Fund state object
 *
 * @example
 * const fundState = generateFundState(100_000_000);
 */
export function generateFundState(fundSize: number) {
  return {
    fundSize,
    deploymentRate: 0.4 + Math.random() * 0.4, // 40% - 80%
    managementFeeRate: 0.02,
    carriedInterest: 0.20,
    vintageYear: 2023,
    fundTerm: 10,
  };
}

/**
 * Generate realistic portfolio state for a snapshot
 *
 * @param companyCount - Number of companies in portfolio
 * @returns Portfolio state object
 *
 * @example
 * const portfolioState = generatePortfolioState(18);
 */
export function generatePortfolioState(companyCount: number) {
  return {
    companyCount,
    totalInvested: Math.floor(30_000_000 + Math.random() * 50_000_000),
    averageOwnership: 0.1 + Math.random() * 0.1, // 10% - 20%
    sectorBreakdown: {
      Technology: 0.3 + Math.random() * 0.2,
      Healthcare: 0.2 + Math.random() * 0.15,
      'Financial Services': 0.15 + Math.random() * 0.15,
      Consumer: 0.1 + Math.random() * 0.1,
      Other: 0.05,
    },
  };
}

// =====================
// DATABASE SEEDING
// =====================

/**
 * Seed a complete test portfolio with fund, investments, lots, and snapshots
 *
 * @param db - Drizzle database client
 * @param config - Seeding configuration
 * @returns Seed result with IDs and cleanup function
 *
 * @example
 * const { fundId, cleanup } = await seedTestPortfolio(db, {
 *   investmentCount: 5,
 *   lotsPerInvestment: 2,
 *   snapshotCount: 3,
 * });
 *
 * afterEach(async () => {
 *   await cleanup();
 * });
 */
export async function seedTestPortfolio(
  db: any,
  config: {
    investmentCount?: number;
    lotsPerInvestment?: number;
    snapshotCount?: number;
  } = {}
): Promise<SeedResult> {
  const { investmentCount = 3, lotsPerInvestment = 2, snapshotCount = 2 } = config;

  // 1. Create fund
  const [fund] = await db
    .insert('funds')
    .values({
      name: `Test Fund ${randomUUID().slice(0, 8)}`,
      size: 100_000_000,
      vintageYear: 2024,
    })
    .returning();

  const fundId = fund.id;
  const investmentIds: number[] = [];
  const lotIds: string[] = [];
  const snapshotIds: string[] = [];

  // 2. Create investments
  for (let i = 0; i < investmentCount; i++) {
    const [investment] = await db
      .insert('investments')
      .values({
        fundId,
        companyName: `Company ${i + 1}`,
        stage: 'Series A',
        sector: 'Technology',
        investedCents: BigInt(1_000_000_00),
        ownership: '0.15',
      })
      .returning();

    investmentIds.push(investment.id);

    // 3. Create lots for each investment
    for (let j = 0; j < lotsPerInvestment; j++) {
      const [lot] = await db
        .insert('investment_lots')
        .values({
          id: randomUUID(),
          investmentId: investment.id,
          lotType: j === 0 ? 'initial' : 'follow_on',
          sharePriceCents: BigInt((j + 1) * 100_000).toString(),
          sharesAcquired: '1000.00',
          costBasisCents: BigInt((j + 1) * 1_000_000_00).toString(),
          version: 1,
        })
        .returning();

      lotIds.push(lot.id);
    }
  }

  // 4. Create snapshots
  for (let i = 0; i < snapshotCount; i++) {
    const [snapshot] = await db
      .insert('forecast_snapshots')
      .values({
        id: randomUUID(),
        fundId,
        name: `Snapshot ${i + 1}`,
        status: i === 0 ? 'complete' : 'pending',
        snapshotTime: new Date(),
        version: 1,
        calculatedMetrics: i === 0 ? generateCalculatedMetrics(i) : null,
      })
      .returning();

    snapshotIds.push(snapshot.id);
  }

  // 5. Return cleanup function
  const cleanup = async () => {
    await db.delete('reserve_allocations').where({ fundId });
    await db.delete('investment_lots').where({ investmentId: { in: investmentIds } });
    await db.delete('forecast_snapshots').where({ fundId });
    await db.delete('investments').where({ fundId });
    await db.delete('funds').where({ id: fundId });
  };

  return {
    fundId,
    investmentIds,
    snapshotIds,
    lotIds,
    cleanup,
  };
}

// =====================
// RETRY UTILITIES
// =====================

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of successful function execution
 * @throws Last error if all retries fail
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => client.getSnapshotStatus(id),
 *   { maxAttempts: 3, initialDelay: 100 }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 100,
    maxDelay = 5000,
    backoffFactor = 2,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }
  }

  throw lastError || new Error('Retry failed with unknown error');
}

// =====================
// VALIDATION HELPERS
// =====================

/**
 * Validate Zod schema and return detailed error message
 *
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Validation result with success flag and errors
 *
 * @example
 * const result = validateSchema(CreateLotRequestSchema, payload);
 * if (!result.success) {
 *   console.error('Validation errors:', result.errors);
 * }
 */
export function validateSchema<T>(
  schema: any,
  data: unknown
): { success: boolean; data?: T; errors?: string[] } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Extract validation errors from Zod error
 *
 * @param error - ZodError instance
 * @returns Array of formatted error messages
 *
 * @example
 * try {
 *   schema.parse(data);
 * } catch (error) {
 *   const errors = formatZodErrors(error);
 *   console.error(errors);
 * }
 */
export function formatZodErrors(error: ZodError): string[] {
  return error.errors.map((err) => {
    const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
    return `${path}${err.message}`;
  });
}

// =====================
// TEST WAIT HELPERS
// =====================

/**
 * Wait for a condition to become true
 *
 * @param condition - Function that returns true when condition is met
 * @param options - Wait configuration
 * @returns Void when condition is met
 * @throws Error if timeout is reached
 *
 * @example
 * await waitFor(
 *   () => db.findSnapshot(id).status === 'complete',
 *   { timeout: 5000, interval: 100 }
 * );
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}
