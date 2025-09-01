/**
 * Server-side approval guard for policy enforcement
 * Ensures dual approval is required before any reserve strategy execution
 */

import { db } from '../db.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import _crypto from 'crypto';
import { recordApprovalCreation, approvalMetrics } from '../observability/production-metrics.js';
import { 
  validateDistinctSigners, 
  canonicalJsonHash, 
  ApprovalRateLimiter 
} from './quick-wins.js';
import { reserveApprovals } from '../../shared/schemas/reserve-approvals.js';

// Initialize rate limiter for approval creation
const approvalRateLimiter = new ApprovalRateLimiter(3, 60000); // 3 requests per minute

export interface ApprovalVerificationOptions {
  strategyId: string;
  inputsHash: string;
  minApprovals?: number;
  expiresAfterHours?: number;
  requireDistinctPartners?: boolean;
}

export interface ApprovalVerificationResult {
  ok: boolean;
  approvalId?: string;
  reason?: string;
  signatures?: Array<{
    partnerEmail: string;
    approvedAt: Date;
  }>;
  calculationHash?: string;
}

/**
 * Compute deterministic hash of strategy inputs
 * Uses canonical JSON hashing to ensure consistency
 */
export function computeStrategyHash(strategyData: any): string {
  return canonicalJsonHash(strategyData);
}

/**
 * Verify that a reserve strategy change has proper approvals
 */
export async function verifyApproval(
  options: ApprovalVerificationOptions
): Promise<ApprovalVerificationResult> {
  const {
    strategyId,
    inputsHash,
    minApprovals = 2,
    expiresAfterHours = 72,
    requireDistinctPartners = true
  } = options;

  try {
    // Find matching approval request
    const [approval] = await db.select()
      .from(reserveApprovals)
      .where(
        and(
          eq(reserveApprovals.strategyId, strategyId),
          eq(reserveApprovals.calculationHash, inputsHash),
          eq(reserveApprovals.status, 'approved'),
          gte(reserveApprovals.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!approval) {
      // Check if there's a pending approval
      const [pending] = await db.select()
        .from(reserveApprovals)
        .where(
          and(
            eq(reserveApprovals.strategyId, strategyId),
            eq(reserveApprovals.calculationHash, inputsHash),
            eq(reserveApprovals.status, 'pending')
          )
        )
        .limit(1);

      if (pending) {
        return {
          ok: false,
          approvalId: pending.id,
          reason: 'Approval is pending and requires partner signatures'
        };
      }

      return {
        ok: false,
        reason: 'No approval found for this strategy and inputs combination'
      };
    }

    // Get signatures with proper partner information from database
    const signatures = await db.execute(sql`
      SELECT 
        p.partner_id,
        s.partner_email,
        s.signed_at as approved_at
      FROM approval_signatures s
      INNER JOIN partners p ON s.partner_id = p.id
      WHERE s.approval_id = ${approval.id}
    `);

    // Validate minimum approvals
    const sigCount = signatures.rows.length;
    if (sigCount < minApprovals) {
      approvalMetrics.denied.inc({ reason: 'insufficient_signatures' });
      return {
        ok: false,
        approvalId: approval.id,
        reason: `Insufficient approvals: ${sigCount}/${minApprovals}`,
        signatures: signatures.rows as { partnerEmail: string; approvedAt: Date; }[]
      };
    }

    // Validate distinct partners if required
    if (requireDistinctPartners) {
      // Enhanced validation: check actual partner ID uniqueness from partners table
      const validation = validateDistinctSigners(
        signatures.rows.map((s: any) => ({ 
          partnerId: s.partner_id, // Use actual partner_id from partners table
          partnerEmail: s.partner_email 
        }))
      );
      
      if (!validation.valid || validation.uniqueCount < minApprovals) {
        approvalMetrics.denied.inc({ reason: 'duplicate_signers' });
        return {
          ok: false,
          approvalId: approval.id,
          reason: `Approvals must be from ${minApprovals} distinct partners (found ${validation.uniqueCount} unique)`,
          signatures: signatures.rows as { partnerEmail: string; approvedAt: Date; }[]
        };
      }
    }

    // Check TTL (expires_at is authoritative)
    if (new Date() > new Date(approval.expiresAt)) {
      // Mark as expired (should be handled by automatic TTL, but safety check)
      await db.execute(sql`
        UPDATE reserve_approvals 
        SET status = 'expired', updated_at = NOW()
        WHERE id = ${approval.id}
      `);

      approvalMetrics.denied.inc({ reason: 'expired' });
      return {
        ok: false,
        approvalId: approval.id,
        reason: 'Approval has expired',
        signatures: signatures.rows as { partnerEmail: string; approvedAt: Date; }[]
      };
    }

    // Record successful verification
    const timer = approvalMetrics.verifyDuration.startTimer({ result: 'success' });
    timer();

    return {
      ok: true,
      approvalId: approval.id,
      signatures: signatures.rows,
      calculationHash: approval.calculationHash || undefined
    };

  } catch (error) {
    console.error('Error verifying approval:', error);
    
    // Record failed verification
    const timer = approvalMetrics.verifyDuration.startTimer({ result: 'error' });
    timer();
    
    return {
      ok: false,
      reason: 'Failed to verify approval: ' + (error as Error).message
    };
  }
}

/**
 * Express middleware to enforce approval on protected routes
 */
export function requireApproval(options?: Partial<ApprovalVerificationOptions>) {
  return async (req: any, res: any, next: any) => {
    try {
      // Extract strategy ID and compute inputs hash
      const strategyId = req.body.strategyId || req.params.strategyId;
      const strategyData = req.body.strategyData || req.body;
      
      if (!strategyId) {
        return res.status(400).json({
          error: 'strategy_id_required',
          message: 'Strategy ID is required for approval verification'
        });
      }

      const inputsHash = computeStrategyHash(strategyData);

      // Verify approval
      const result = await verifyApproval({
        strategyId,
        inputsHash,
        ...options
      });

      if (!result.ok) {
        return res.status(403).json({
          error: 'approval_required',
          message: result.reason,
          approvalId: result.approvalId,
          details: {
            strategyId,
            inputsHash,
            signatures: result.signatures
          }
        });
      }

      // Attach approval info to request for downstream use
      req.approval = {
        id: result.approvalId,
        signatures: result.signatures,
        calculationHash: result.calculationHash
      };

      next();
    } catch (error) {
      console.error('Approval middleware error:', error);
      res.status(500).json({
        error: 'approval_verification_failed',
        message: 'Failed to verify approval'
      });
    }
  };
}

/**
 * Check if a strategy change would be high-impact and require approval
 */
export function requiresApproval(
  action: 'create' | 'update' | 'delete',
  estimatedAmount: number,
  affectedFunds: number
): boolean {
  // High-impact thresholds
  const HIGH_AMOUNT_THRESHOLD = 1000000; // $1M
  const HIGH_FUND_COUNT = 3;

  // Deletes always require approval
  if (action === 'delete') return true;

  // Large amounts require approval
  if (estimatedAmount >= HIGH_AMOUNT_THRESHOLD) return true;

  // Changes affecting multiple funds require approval
  if (affectedFunds >= HIGH_FUND_COUNT) return true;

  // Updates to existing strategies require approval if they change allocation by >20%
  if (action === 'update') {
    // This would need additional logic to compare old vs new
    return true;
  }

  return false;
}

/**
 * Create approval request if needed based on impact assessment
 */
export async function createApprovalIfNeeded(
  strategyId: string,
  action: 'create' | 'update' | 'delete',
  strategyData: any,
  reason: string,
  requestedBy: string,
  impact: {
    affectedFunds: string[];
    estimatedAmount: number;
    riskLevel: 'low' | 'medium' | 'high';
  }
): Promise<{ requiresApproval: boolean; approvalId?: string; rateLimited?: boolean }> {
  
  const needsApproval = requiresApproval(
    action,
    impact.estimatedAmount,
    impact.affectedFunds.length
  );

  if (!needsApproval) {
    return { requiresApproval: false };
  }

  // Check if approval already exists
  const inputsHash = computeStrategyHash(strategyData);
  
  // Apply rate limiting to prevent approval storms
  const rateLimitCheck = approvalRateLimiter.canCreateApproval(strategyId, inputsHash);
  if (!rateLimitCheck.allowed) {
    return {
      requiresApproval: true,
      rateLimited: true
    };
  }
  const existing = await db.select()
    .from(reserveApprovals)
    .where(
      and(
        eq(reserveApprovals.strategyId, strategyId),
        eq(reserveApprovals.calculationHash, inputsHash),
        sql`status IN ('pending', 'approved')`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      requiresApproval: true,
      approvalId: existing[0].id
    };
  }

  // Create new approval request
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const [approval] = await db.insert(reserveApprovals)
    .values({
      strategyId,
      requestedBy,
      action,
      strategyData,
      reason,
      affectedFunds: impact.affectedFunds,
      estimatedAmount: Math.round(impact.estimatedAmount * 100),
      riskLevel: impact.riskLevel,
      expiresAt,
      calculationHash: inputsHash,
      status: 'pending'
    })
    .returning();

  return {
    requiresApproval: true,
    approvalId: approval.id
  };
}