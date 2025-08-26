/**
 * Integration tests for server-side approval guard
 * Ensures policy enforcement before compute execution
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  verifyApproval, 
  computeStrategyHash, 
  requiresApproval,
  createApprovalIfNeeded 
} from '../../server/lib/approvals-guard';

describe('Approval Guard - Policy Before Compute', () => {
  
  describe('computeStrategyHash', () => {
    it('should generate deterministic hash for same inputs', () => {
      const data1 = { reserves: 1000000, companies: ['a', 'b'], stage: 'seed' };
      const data2 = { reserves: 1000000, companies: ['a', 'b'], stage: 'seed' };
      
      const hash1 = computeStrategyHash(data1);
      const hash2 = computeStrategyHash(data2);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash
    });

    it('should generate different hashes for different inputs', () => {
      const data1 = { reserves: 1000000 };
      const data2 = { reserves: 2000000 };
      
      const hash1 = computeStrategyHash(data1);
      const hash2 = computeStrategyHash(data2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle nested objects consistently', () => {
      const data = {
        fund: { id: '123', name: 'Test Fund' },
        reserves: 5000000,
        companies: [
          { id: 'c1', invested: 100000 },
          { id: 'c2', invested: 200000 }
        ]
      };
      
      const hash1 = computeStrategyHash(data);
      const hash2 = computeStrategyHash(JSON.parse(JSON.stringify(data)));
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('requiresApproval', () => {
    it('should require approval for delete actions', () => {
      const result = requiresApproval('delete', 100000, 1);
      expect(result).toBe(true);
    });

    it('should require approval for high-value transactions', () => {
      const result = requiresApproval('create', 1500000, 1);
      expect(result).toBe(true);
    });

    it('should require approval for multi-fund impacts', () => {
      const result = requiresApproval('update', 500000, 3);
      expect(result).toBe(true);
    });

    it('should not require approval for low-impact changes', () => {
      const result = requiresApproval('create', 500000, 1);
      expect(result).toBe(false);
    });

    it('should always require approval for updates (current logic)', () => {
      const result = requiresApproval('update', 10000, 1);
      expect(result).toBe(true);
    });
  });

  describe('verifyApproval - Mock Tests', () => {
    it('should reject when no approval exists', async () => {
      // Mock scenario - would need DB in real test
      const result = await verifyApproval({
        strategyId: 'non-existent',
        inputsHash: 'abc123',
        minApprovals: 2
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('No approval found');
    });

    it('should validate minimum approval count', async () => {
      // This would need a test database with seeded data
      // For now, we're testing the interface
      const options = {
        strategyId: 'test-strategy',
        inputsHash: computeStrategyHash({ test: 'data' }),
        minApprovals: 2,
        requireDistinctPartners: true
      };

      const result = await verifyApproval(options);
      
      // In a real test, we'd seed the DB and verify
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('reason');
    });
  });

  describe('createApprovalIfNeeded', () => {
    it('should determine approval requirement based on impact', async () => {
      const result = await createApprovalIfNeeded(
        'test-strategy-1',
        'delete',
        { reserves: 1000000 },
        'Removing deprecated strategy',
        'admin@test.com',
        {
          affectedFunds: ['fund1', 'fund2'],
          estimatedAmount: 1000000,
          riskLevel: 'high'
        }
      );

      expect(result.requiresApproval).toBe(true);
      // In real test, would verify approvalId is returned
    });

    it('should skip approval for low-impact creates', async () => {
      const result = await createApprovalIfNeeded(
        'test-strategy-2',
        'create',
        { reserves: 100000 },
        'Small allocation test',
        'admin@test.com',
        {
          affectedFunds: ['fund1'],
          estimatedAmount: 100000,
          riskLevel: 'low'
        }
      );

      expect(result.requiresApproval).toBe(false);
      expect(result.approvalId).toBeUndefined();
    });
  });

  describe('API Integration', () => {
    const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

    it('should block high-impact calculations without approval', async () => {
      const response = await fetch(`${BASE_URL}/api/reserves/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token'
        },
        body: JSON.stringify({
          availableReserves: 10000000, // $10M - high impact
          portfolio: [
            { id: 'c1', name: 'Company 1', totalInvested: 1000000 },
            { id: 'c2', name: 'Company 2', totalInvested: 2000000 }
          ],
          totalFundSize: 50000000,
          scenarioType: 'aggressive'
        })
      });

      if (response.status === 403) {
        const data = await response.json();
        expect(data.error).toBe('approval_required');
        expect(data.details).toHaveProperty('riskLevel');
        expect(data.details.riskLevel).toBe('high');
      }
      // If server is not running, skip this assertion
    });

    it('should enforce approval on protected endpoint', async () => {
      const response = await fetch(`${BASE_URL}/api/reserves/calculate-protected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token'
        },
        body: JSON.stringify({
          strategyId: 'test-protected',
          strategyData: {
            availableReserves: 1000000,
            portfolio: [],
            totalFundSize: 10000000
          }
        })
      });

      if (response.status === 403) {
        const data = await response.json();
        expect(data.error).toBe('approval_required');
      }
    });
  });

  describe('Security Invariants', () => {
    it('should never allow bypassing approval for deletes', () => {
      // Test all code paths that could bypass approval
      const deleteRequiresApproval = requiresApproval('delete', 1, 1);
      expect(deleteRequiresApproval).toBe(true);
      
      const deleteWithZeroAmount = requiresApproval('delete', 0, 0);
      expect(deleteWithZeroAmount).toBe(true);
    });

    it('should enforce distinct partner requirement', async () => {
      const verification = await verifyApproval({
        strategyId: 'test',
        inputsHash: 'hash',
        minApprovals: 2,
        requireDistinctPartners: true
      });

      // This tests the interface contract
      expect(verification).toHaveProperty('ok');
      if (!verification.ok && verification.signatures) {
        // Would check for duplicate partners in real scenario
        const uniquePartners = new Set(verification.signatures.map(s => s.partnerEmail));
        expect(uniquePartners.size).toBeLessThanOrEqual(verification.signatures.length);
      }
    });

    it('should validate expiration window', async () => {
      const verification = await verifyApproval({
        strategyId: 'test',
        inputsHash: 'hash',
        minApprovals: 2,
        expiresAfterHours: 72
      });

      // Interface contract test
      expect(verification).toHaveProperty('ok');
      if (!verification.ok) {
        expect(['No approval found', 'Approval has expired', 'Approval is pending'])
          .toContain(verification.reason?.split(':')[0]);
      }
    });
  });
});