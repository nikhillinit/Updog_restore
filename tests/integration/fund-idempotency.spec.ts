import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Fund } from '@shared/schema';

describe('Fund Creation Idempotency', () => {
  let testFundData: Partial<Fund>;
  let createdFundId: number | null = null;

  beforeEach(() => {
    testFundData = {
      name: `Test Fund ${Date.now()}`,
      size: 10000000,
      managementFee: 2.0,
      carryPercentage: 20,
      vintageYear: new Date().getFullYear(),
      deployedCapital: 0,
      status: 'active',
      termYears: 10
    };
  });

  afterEach(async () => {
    // Clean up created fund if exists
    if (createdFundId) {
      try {
        await fetch(`/api/funds/${createdFundId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Cleanup failed:', error);
      }
      createdFundId = null;
    }
  });

  describe('Double-submit prevention', () => {
    it('should handle concurrent identical requests gracefully', async () => {
      // Send two identical requests simultaneously
      const [response1, response2] = await Promise.all([
        fetch('/api/funds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testFundData)
        }),
        fetch('/api/funds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testFundData)
        })
      ]);

      // One should succeed, one should get 409 conflict
      const statuses = [response1.status, response2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Extract the successful response
      const successResponse = response1.status === 201 ? response1 : response2;
      const fund = await successResponse.json();
      createdFundId = fund.id;

      // Verify only one fund was created
      const listResponse = await fetch('/api/funds');
      const funds = await listResponse.json();
      const matchingFunds = funds.filter((f: Fund) => f.name === testFundData.name);
      expect(matchingFunds).toHaveLength(1);
    });

    it('should return 409 for duplicate submission with same idempotency key', async () => {
      const idempotencyKey = `test-key-${Date.now()}`;
      
      // First request
      const response1 = await fetch('/api/funds', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(testFundData)
      });
      
      expect(response1.status).toBe(201);
      const fund = await response1.json();
      createdFundId = fund.id;

      // Second request with same idempotency key
      const response2 = await fetch('/api/funds', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(testFundData)
      });
      
      expect(response2.status).toBe(409);
      const error = await response2.json();
      expect(error.message).toContain('duplicate');
    });
  });

  describe('Inflight map cleanup', () => {
    it('should clean up inflight map on AbortError', async () => {
      const controller = new AbortController();
      
      // Start request and abort it immediately
      const requestPromise = fetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testFundData),
        signal: controller.signal
      });

      // Abort the request
      setTimeout(() => controller.abort(), 10);

      // Request should fail with AbortError
      await expect(requestPromise).rejects.toThrow(/abort/i);

      // Subsequent identical request should succeed (not be blocked)
      const response = await fetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testFundData)
      });

      expect(response.status).toBe(201);
      const fund = await response.json();
      createdFundId = fund.id;
    });

    it('should handle network errors gracefully', async () => {
      // Create a fund with invalid data to trigger validation error
      const invalidData = { ...testFundData, size: -1000 };
      
      const response1 = await fetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      expect(response1.status).toBe(400);

      // Valid request with same name should succeed
      const response2 = await fetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testFundData)
      });

      expect(response2.status).toBe(201);
      const fund = await response2.json();
      createdFundId = fund.id;
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid sequential requests', async () => {
      const results: number[] = [];
      
      // Send 5 rapid sequential requests
      for (let i = 0; i < 5; i++) {
        const response = await fetch('/api/funds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testFundData)
        });
        results.push(response.status);
        
        if (response.status === 201 && !createdFundId) {
          const fund = await response.json();
          createdFundId = fund.id;
        }
      }

      // First should succeed, rest should get 409
      expect(results[0]).toBe(201);
      expect(results.slice(1).every(status => status === 409)).toBe(true);
    });

    it('should differentiate between different fund data', async () => {
      // Create first fund
      const response1 = await fetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testFundData)
      });
      
      expect(response1.status).toBe(201);
      const fund1 = await response1.json();
      createdFundId = fund1.id;

      // Create different fund
      const differentFundData = {
        ...testFundData,
        name: `Different Fund ${Date.now()}`
      };
      
      const response2 = await fetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(differentFundData)
      });
      
      expect(response2.status).toBe(201);
      const fund2 = await response2.json();
      
      // Clean up second fund
      await fetch(`/api/funds/${fund2.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(fund1.id).not.toBe(fund2.id);
    });
  });
});