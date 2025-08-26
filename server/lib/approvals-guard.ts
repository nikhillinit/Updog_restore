/**
 * Server-side approval guard for policy enforcement
 * Ensures dual approval is required before any reserve strategy execution
 */

import { db } from './db.js';
import { reserveApprovals, approvalSignatures } from '@shared/schemas/reserve-approvals.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import crypto from 'crypto';

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
 */
export function computeStrategyHash(strategyData: any): string {
  // Sort keys for deterministic serialization
  const normalized = JSON.stringify(strategyData, Object.keys(strategyData).sort());
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex');
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

    // Get signatures
    const signatures = await db.select({
      partnerEmail: approvalSignatures.partnerEmail,
      approvedAt: approvalSignatures.approvedAt
    })
      .from(approvalSignatures)
      .where(eq(approvalSignatures.approvalId, approval.id));

    // Validate minimum approvals
    if (signatures.length < minApprovals) {
      return {
        ok: false,
        approvalId: approval.id,
        reason: `Insufficient approvals: ${signatures.length}/${minApprovals}`,
        signatures
      };
    }

    // Validate distinct partners if required
    if (requireDistinctPartners) {
      const uniquePartners = new Set(signatures.map(s => s.partnerEmail));
      if (uniquePartners.size < minApprovals) {
        return {
          ok: false,
          approvalId: approval.id,
          reason: 'Approvals must be from distinct partners',
          signatures
        };
      }
    }

    // Check if approval is still within validity window
    const approvalAge = Date.now() - new Date(approval.requestedAt).getTime();
    const maxAge = expiresAfterHours * 60 * 60 * 1000;
    if (approvalAge > maxAge) {
      // Mark as expired
      await db.update(reserveApprovals)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(reserveApprovals.id, approval.id));

      return {
        ok: false,
        approvalId: approval.id,
        reason: 'Approval has expired',
        signatures
      };
    }

    return {
      ok: true,
      approvalId: approval.id,
      signatures,
      calculationHash: approval.calculationHash || undefined
    };

  } catch (error) {
    console.error('Error verifying approval:', error);
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
): Promise<{ requiresApproval: boolean; approvalId?: string }> {
  
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