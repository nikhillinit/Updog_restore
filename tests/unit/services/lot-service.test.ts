/**
 * Lot Service Tests (Phase 0-ALPHA - TDD RED Phase)
 *
 * Tests for LotService covering:
 * - create() with valid lot data
 * - create() with cost basis mismatch (validation error)
 * - create() with duplicate idempotency key
 * - create() with cross-fund security validation
 * - list() filtered by investment ID
 * - list() with pagination
 *
 * Version: 1.0.0 (Phase 0-ALPHA)
 * Created: 2025-11-10
 *
 * @module tests/services/lot-service.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LotService,
  type CreateLotData,
  LotNotFoundError,
  InvestmentNotFoundError,
  InvestmentFundMismatchError,
  CostBasisMismatchError,
} from '../../server/services/lot-service';
import {
  createTestLot,
  SAMPLE_LOTS,
} from '../fixtures/portfolio-fixtures';
import {
  assertValidLot,
  assertValidUUID,
  assertBigIntEquals,
  generateIdempotencyKey,
} from '../utils/portfolio-test-utils';

describe('LotService (Phase 0-ALPHA - TDD RED)', () => {
  let service: LotService;

  beforeEach(() => {
    service = new LotService();
  });

  describe('create()', () => {
    it('should create a lot with valid data', async () => {
      // ARRANGE
      const fundId = 1;
      const data: CreateLotData = {
        investmentId: 1,
        lotType: 'initial',
        sharePriceCents: BigInt(250_000), // $2.50/share
        sharesAcquired: '1000.00000000', // 1000 shares
        costBasisCents: BigInt(250_000_000), // $2.5M
        idempotencyKey: generateIdempotencyKey(),
      };

      // ACT
      const lot = await service.create(fundId, data);

      // ASSERT
      assertValidLot(lot);
      expect(lot.investmentId).toBe(data.investmentId);
      expect(lot.lotType).toBe(data.lotType);
      assertBigIntEquals(lot.sharePriceCents, data.sharePriceCents);
      expect(lot.sharesAcquired).toBe(data.sharesAcquired);
      assertBigIntEquals(lot.costBasisCents, data.costBasisCents);
      expect(lot.version).toBe(BigInt(1));
      expect(lot.idempotencyKey).toBe(data.idempotencyKey);
      assertValidUUID(lot.id);
      expect(lot.createdAt).toBeInstanceOf(Date);
      expect(lot.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a lot without idempotency key', async () => {
      // ARRANGE
      const fundId = 1;
      const data: CreateLotData = {
        investmentId: 1,
        lotType: 'follow_on',
        sharePriceCents: BigInt(500_000),
        sharesAcquired: '500.00000000',
        costBasisCents: BigInt(250_000_000),
      };

      // ACT
      const lot = await service.create(fundId, data);

      // ASSERT
      assertValidLot(lot);
      expect(lot.idempotencyKey).toBeNull();
    });

    it('should return existing lot on duplicate idempotency key', async () => {
      // ARRANGE
      const fundId = 1;
      const idempotencyKey = generateIdempotencyKey();
      const data: CreateLotData = {
        investmentId: 1,
        lotType: 'initial',
        sharePriceCents: BigInt(250_000),
        sharesAcquired: '1000.00000000',
        costBasisCents: BigInt(250_000_000),
        idempotencyKey,
      };

      // ACT
      const first = await service.create(fundId, data);
      const second = await service.create(fundId, data); // Duplicate request

      // ASSERT
      expect(first.id).toBe(second.id);
      expect(first.version).toBe(second.version);
      expect(first.createdAt).toEqual(second.createdAt);
    });

    it('should throw InvestmentNotFoundError if investment does not exist', async () => {
      // ARRANGE
      const fundId = 1;
      const data: CreateLotData = {
        investmentId: 99999, // Non-existent investment
        lotType: 'initial',
        sharePriceCents: BigInt(250_000),
        sharesAcquired: '1000.00000000',
        costBasisCents: BigInt(250_000_000),
      };

      // ACT & ASSERT
      await expect(service.create(fundId, data)).rejects.toThrow(
        InvestmentNotFoundError
      );
      await expect(service.create(fundId, data)).rejects.toThrow(
        'Investment not found: 99999'
      );
    });

    it('should throw InvestmentFundMismatchError if investment belongs to different fund', async () => {
      // ARRANGE
      const fundId = 1;
      const data: CreateLotData = {
        investmentId: 5, // Belongs to fund 2, not fund 1
        lotType: 'initial',
        sharePriceCents: BigInt(250_000),
        sharesAcquired: '1000.00000000',
        costBasisCents: BigInt(250_000_000),
      };

      // ACT & ASSERT
      await expect(service.create(fundId, data)).rejects.toThrow(
        InvestmentFundMismatchError
      );
      await expect(service.create(fundId, data)).rejects.toThrow(
        'Investment 5 does not belong to fund 1'
      );
    });

    it('should throw CostBasisMismatchError if cost basis is incorrect', async () => {
      // ARRANGE
      const fundId = 1;
      const sharePriceCents = BigInt(250_000); // $2.50/share
      const sharesAcquired = '1000.00000000'; // 1000 shares
      const correctCostBasis = BigInt(250_000_000); // $2.5M
      const incorrectCostBasis = BigInt(100_000_000); // $1M (wrong!)

      const data: CreateLotData = {
        investmentId: 1,
        lotType: 'initial',
        sharePriceCents,
        sharesAcquired,
        costBasisCents: incorrectCostBasis, // Intentionally wrong
      };

      // ACT & ASSERT
      await expect(service.create(fundId, data)).rejects.toThrow(CostBasisMismatchError);
      await expect(service.create(fundId, data)).rejects.toThrow(
        /expected.*got/i
      );
    });

    it('should accept cost basis within tolerance (rounding)', async () => {
      // ARRANGE
      const fundId = 1;
      const sharePriceCents = BigInt(333_333); // $3.33333/share (fractional)
      const sharesAcquired = '1000.12345678'; // Fractional shares
      const costBasisCents = BigInt(333_374_433); // Calculated and rounded

      const data: CreateLotData = {
        investmentId: 1,
        lotType: 'initial',
        sharePriceCents,
        sharesAcquired,
        costBasisCents,
      };

      // ACT
      const lot = await service.create(fundId, data);

      // ASSERT
      assertValidLot(lot);
      assertBigIntEquals(lot.costBasisCents, costBasisCents, BigInt(1000)); // 1000 cents = $10 tolerance
    });

    it('should create lots with different lot types', async () => {
      // ARRANGE
      const fundId = 1;
      const lotTypes: Array<'initial' | 'follow_on' | 'secondary'> = [
        'initial',
        'follow_on',
        'secondary',
      ];

      // ACT & ASSERT
      for (const lotType of lotTypes) {
        const data: CreateLotData = {
          investmentId: 1,
          lotType,
          sharePriceCents: BigInt(250_000),
          sharesAcquired: '1000.00000000',
          costBasisCents: BigInt(250_000_000),
          idempotencyKey: generateIdempotencyKey(), // Unique for each
        };

        const lot = await service.create(fundId, data);

        expect(lot.lotType).toBe(lotType);
      }
    });
  });

  describe('list()', () => {
    it('should list lots with default pagination', async () => {
      // ARRANGE
      const fundId = 1;

      // ACT
      const result = await service.list(fundId, {});

      // ASSERT
      expect(result).toHaveProperty('lots');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.lots)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');

      if (result.lots.length > 0) {
        result.lots.forEach(assertValidLot);
      }
    });

    it('should filter lots by investment ID', async () => {
      // ARRANGE
      const fundId = 1;
      const investmentId = 2;

      // ACT
      const result = await service.list(fundId, { investmentId });

      // ASSERT
      expect(result.lots).toBeDefined();
      result.lots.forEach((lot) => {
        expect(lot.investmentId).toBe(investmentId);
      });
    });

    it('should filter lots by lot type', async () => {
      // ARRANGE
      const fundId = 1;
      const lotType: 'follow_on' = 'follow_on';

      // ACT
      const result = await service.list(fundId, { lotType });

      // ASSERT
      expect(result.lots).toBeDefined();
      result.lots.forEach((lot) => {
        expect(lot.lotType).toBe(lotType);
      });
    });

    it('should respect limit parameter', async () => {
      // ARRANGE
      const fundId = 1;
      const limit = 5;

      // ACT
      const result = await service.list(fundId, { limit });

      // ASSERT
      expect(result.lots.length).toBeLessThanOrEqual(limit);
    });

    it('should paginate with cursor', async () => {
      // ARRANGE
      const fundId = 1;
      const limit = 2;

      // ACT
      const page1 = await service.list(fundId, { limit });

      // ASSERT
      if (page1.hasMore) {
        expect(page1.nextCursor).toBeDefined();

        const page2 = await service.list(fundId, {
          limit,
          cursor: page1.nextCursor,
        });

        expect(page2.lots.length).toBeGreaterThan(0);

        // Ensure no duplicate IDs between pages
        const page1Ids = page1.lots.map((l) => l.id);
        const page2Ids = page2.lots.map((l) => l.id);
        const intersection = page1Ids.filter((id) => page2Ids.includes(id));
        expect(intersection.length).toBe(0);
      }
    });

    it('should return empty array if no lots exist', async () => {
      // ARRANGE
      const fundId = 1;

      // ACT
      const result = await service.list(fundId, {});

      // ASSERT
      expect(result.lots).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should combine investmentId and lotType filters', async () => {
      // ARRANGE
      const fundId = 1;
      const investmentId = 3;
      const lotType: 'follow_on' = 'follow_on';

      // ACT
      const result = await service.list(fundId, { investmentId, lotType });

      // ASSERT
      result.lots.forEach((lot) => {
        expect(lot.investmentId).toBe(investmentId);
        expect(lot.lotType).toBe(lotType);
      });
    });
  });
});
