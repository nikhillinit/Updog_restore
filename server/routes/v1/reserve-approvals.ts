/**
 * Reserve Strategy Dual Approval API
 * Requires both partners to approve changes to reserve strategies
 */

import type { Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../lib/auth/jwt.js';
import { db } from '../../db';
import { reserveApprovals, approvalSignatures, approvalAuditLog, approvalPartners } from '@shared/schemas/reserve-approvals.js';
import { eq, and, gte } from 'drizzle-orm';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getConfig } from '../../config';

const router = Router();

// All routes require authentication
router["use"](requireAuth());

/**
 * Request schema for creating approval request
 */
const createApprovalSchema = z.object({
  strategyId: z.string(),
  action: z.enum(['create', 'update', 'delete']),
  strategyData: z.record(z.unknown()),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  impact: z.object({
    affectedFunds: z.array(z.string()),
    estimatedAmount: z.number().positive(),
    riskLevel: z.enum(['low', 'medium', 'high'])
  })
});

/**
 * POST /api/v1/reserve-approvals - Create new approval request
 */
router["post"]('/', requireRole('reserve_admin'), (async (req: Request, res: Response) => {
  try {
    const validation = createApprovalSchema.safeParse(req.body);
    if (!validation.success) {
      return res["status"](400)["json"]({ 
        error: 'validation_error', 
        issues: validation.error.issues 
      } as any);
    }

    const { strategyId, action, strategyData, reason, impact } = validation.data;
    
    // Calculate deterministic hash of the changes
    const calculationHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ strategyData, timestamp: Date.now() }))
      .digest('hex');
    
    // Create approval request (expires in 72 hours)
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    
    const [approval] = await db.insert(reserveApprovals).values({
      strategyId,
      requestedBy: req.user.email,
      action,
      strategyData,
      reason,
      affectedFunds: impact.affectedFunds,
      estimatedAmount: Math.round(impact.estimatedAmount * 100), // Convert to cents
      riskLevel: impact.riskLevel,
      expiresAt,
      calculationHash,
      status: 'pending'
    } as any).returning();
    
    // Log the creation
    await db.insert(approvalAuditLog).values({
      approvalId: approval.id,
      action: 'created',
      actor: req.user.email,
      details: { reason, impact },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    } as any);
    
    // Get list of partners to notify
    const partners = await db.select().from(approvalPartners).where(eq(approvalPartners.deactivated, null));
    
    // TODO: Send notifications to partners
    await notifyPartners(partners, approval);
    
    res["status"](201)["json"]({
      success: true,
      approvalId: approval.id,
      expiresAt,
      requiredApprovals: 2,
      notifiedPartners: partners.length,
      message: 'Approval request created. Both partners must approve within 72 hours.'
    } as any);
    
  } catch (error) {
    console.error('Error creating approval request:', error);
    res["status"](500)["json"]({ error: 'Failed to create approval request' });
  }
}) as any);

/**
 * GET /api/v1/reserve-approvals - List pending approvals
 */
router['get']('/', (async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || 'pending';
    
    const approvals = await db.select({
      approval: reserveApprovals,
      signatureCount: db.$count(approvalSignatures, eq(approvalSignatures.approvalId, reserveApprovals.id))
    })
    .from(reserveApprovals)
    .where(
      and(
        eq(reserveApprovals.status, status),
        gte(reserveApprovals.expiresAt, new Date())
      )
    )
    .orderBy(reserveApprovals.requestedAt);
    
    // Get signatures for each approval
    const approvalsWithSignatures = await Promise.all(
      approvals.map(async ({ approval, signatureCount }) => {
        const signatures = await db.select({
          partnerEmail: approvalSignatures.partnerEmail,
          approvedAt: approvalSignatures.approvedAt
        })
        .from(approvalSignatures)
        .where(eq(approvalSignatures.approvalId, approval.id));
        
        return {
          ...approval,
          signatures,
          signatureCount,
          remainingApprovals: 2 - signatureCount
        };
      })
    );
    
    res["json"]({
      approvals: approvalsWithSignatures,
      total: approvalsWithSignatures.length
    } as any);
    
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch approvals' });
  }
}) as any);

/**
 * GET /api/v1/reserve-approvals/:id - Get specific approval details
 */
router['get']('/:id', (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [approval] = await db.select()
      .from(reserveApprovals)
      .where(eq(reserveApprovals.id, id));
    
    if (!approval) {
      return res["status"](404)["json"]({ error: 'Approval not found' });
    }
    
    // Get signatures
    const signatures = await db.select()
      .from(approvalSignatures)
      .where(eq(approvalSignatures.approvalId, id));
    
    // Get audit log
    const auditLog = await db.select()
      .from(approvalAuditLog)
      .where(eq(approvalAuditLog.approvalId, id))
      .orderBy(approvalAuditLog.timestamp);
    
    res["json"]({
      approval,
      signatures,
      auditLog,
      canSign: await canPartnerSign(req.user.email, id),
      isExpired: approval.expiresAt < new Date(),
      isApproved: signatures.length >= 2
    } as any);
    
  } catch (error) {
    console.error('Error fetching approval:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch approval' });
  }
}) as any);

/**
 * POST /api/v1/reserve-approvals/:id/sign - Sign an approval
 */
router["post"]('/:id/sign', requireRole('partner'), (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { verificationCode } = req.body; // Optional 2FA code
    
    // Check if partner is authorized
    const [partner] = await db.select()
      .from(approvalPartners)
      .where(eq(approvalPartners.email, req.user.email));
    
    if (!partner || partner.deactivated) {
      return res["status"](403)["json"]({ error: 'Not authorized as partner' });
    }
    
    // Check if approval exists and is valid
    const [approval] = await db.select()
      .from(reserveApprovals)
      .where(eq(reserveApprovals.id, id));
    
    if (!approval) {
      return res["status"](404)["json"]({ error: 'Approval not found' });
    }
    
    if (approval.status !== 'pending') {
      return res["status"](400)["json"]({ error: `Approval is ${approval.status}` });
    }
    
    if (approval.expiresAt < new Date()) {
      // Mark as expired
      await db.update(reserveApprovals)
        ['set']({ status: 'expired', updatedAt: new Date() } as any)
        .where(eq(reserveApprovals.id, id));
      
      return res["status"](400)["json"]({ error: 'Approval has expired' });
    }
    
    // Check if already signed
    const [existingSignature] = await db.select()
      .from(approvalSignatures)
      .where(
        and(
          eq(approvalSignatures.approvalId, id),
          eq(approvalSignatures.partnerEmail, req.user.email)
        )
      );
    
    if (existingSignature) {
      return res["status"](400)["json"]({ error: 'Already signed this approval' });
    }
    
    // Generate signature
    const signatureData = {
      approvalId: id,
      partnerEmail: req.user.email,
      timestamp: Date.now(),
      calculationHash: approval.calculationHash
    };
    
    const cfg = getConfig();
    const signature = jwt.sign(
      signatureData, 
      cfg.JWT_SECRET!,
      { 
        algorithm: "HS256" as jwt.Algorithm,
        expiresIn: '7d',
        issuer: cfg.JWT_ISSUER,
        audience: cfg.JWT_AUDIENCE
      }
    );
    
    // Record signature
    await db.insert(approvalSignatures).values({
      approvalId: id,
      partnerEmail: req.user.email,
      signature,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      sessionId: req.session?.id,
      twoFactorVerified: verificationCode ? new Date() : null,
      verificationCode: verificationCode ? crypto.createHash('sha256').update(verificationCode).digest('hex') : null
    } as any);
    
    // Log the signing
    await db.insert(approvalAuditLog).values({
      approvalId: id,
      action: 'signed',
      actor: req.user.email,
      details: { verified2FA: !!verificationCode },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    } as any);
    
    // Check if this completes the approval (need 2 signatures)
    const signatureCount = await db.$count(approvalSignatures, eq(approvalSignatures.approvalId, id));
    
    if (signatureCount >= 2) {
      // Mark as approved and execute
      await db.update(reserveApprovals)
        ['set']({ status: 'approved', updatedAt: new Date() } as any)
        .where(eq(reserveApprovals.id, id));
      
      await db.insert(approvalAuditLog).values({
        approvalId: id,
        action: 'executed',
        actor: 'system',
        systemGenerated: new Date(),
        details: { signatureCount }
      } as any);
      
      // TODO: Execute the actual reserve strategy change
      await executeReserveStrategyChange(approval);
      
      res["json"]({
        success: true,
        message: 'Approval signed and executed',
        status: 'approved',
        executed: true
      } as any);
    } else {
      res["json"]({
        success: true,
        message: 'Approval signed successfully',
        remainingApprovals: 2 - signatureCount,
        status: 'pending'
      } as any);
    }
    
  } catch (error) {
    console.error('Error signing approval:', error);
    res["status"](500)["json"]({ error: 'Failed to sign approval' });
  }
}) as any);

/**
 * POST /api/v1/reserve-approvals/:id/reject - Reject an approval
 */
router["post"]('/:id/reject', requireRole('partner'), (async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.length < 10) {
      return res["status"](400)["json"]({ error: 'Rejection reason required (min 10 chars)' });
    }
    
    // Check authorization
    const [partner] = await db.select()
      .from(approvalPartners)
      .where(eq(approvalPartners.email, req.user.email));
    
    if (!partner || partner.deactivated) {
      return res["status"](403)["json"]({ error: 'Not authorized as partner' });
    }
    
    // Update approval status
    await db.update(reserveApprovals)
      ['set']({ status: 'rejected', updatedAt: new Date() } as any)
      .where(eq(reserveApprovals.id, id));
    
    // Log rejection
    await db.insert(approvalAuditLog).values({
      approvalId: id,
      action: 'rejected',
      actor: req.user.email,
      details: { reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    } as any);
    
    res["json"]({
      success: true,
      message: 'Approval rejected',
      rejectedBy: req.user.email
    } as any);
    
  } catch (error) {
    console.error('Error rejecting approval:', error);
    res["status"](500)["json"]({ error: 'Failed to reject approval' });
  }
}) as any);

// Helper functions

async function canPartnerSign(email: string, approvalId: string): Promise<boolean> {
  const [partner] = await db.select()
    .from(approvalPartners)
    .where(eq(approvalPartners.email, email));
  
  if (!partner || partner.deactivated) return false;
  
  const [existingSignature] = await db.select()
    .from(approvalSignatures)
    .where(
      and(
        eq(approvalSignatures.approvalId, approvalId),
        eq(approvalSignatures.partnerEmail, email)
      )
    );
  
  return !existingSignature;
}

async function notifyPartners(partners: any[], approval: any) {
  // TODO: Implement actual notification logic
  // - Send emails
  // - Send Slack messages
  // - Send SMS for high-risk changes
  console.log(`Notifying ${partners.length} partners about approval ${approval.id}`);
}

async function executeReserveStrategyChange(approval: any) {
  // TODO: Implement actual execution logic
  // This would integrate with your reserve calculation engine
  console.log(`Executing reserve strategy change for approval ${approval.id}`);
}

export default router;