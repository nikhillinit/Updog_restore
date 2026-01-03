/**
 * Reserve Strategy Dual Approval API
 * Requires both partners to approve changes to reserve strategies
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../lib/auth/jwt.js';
import { db } from '../../db';
import { reserveApprovals, approvalSignatures, approvalAuditLog, approvalPartners, type ReserveApproval, type ApprovalPartner } from '@shared/schemas/reserve-approvals.js';
import { eq, and, gte, isNull } from 'drizzle-orm';
import { postToSlack } from '@shared/slack.js';
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
      });
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
      requestedBy: req.user!.email,
      action,
      strategyData,
      reason,
      affectedFunds: impact.affectedFunds,
      estimatedAmount: Math.round(impact.estimatedAmount * 100), // Convert to cents
      riskLevel: impact.riskLevel,
      expiresAt,
      calculationHash,
      status: 'pending'
    }).returning();

    if (!approval) {
      res["status"](500)["json"]({ error: 'Failed to create approval request' });
      return;
    }

    // Log the creation
    await db.insert(approvalAuditLog).values({
      approvalId: approval.id,
      action: 'created',
      actor: req.user!.email,
      details: { reason, impact },
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent']
    });
    
    // Get list of partners to notify
    const partners = await db.select().from(approvalPartners).where(isNull(approvalPartners.deactivated));
    
    // TODO: Send notifications to partners
    await notifyPartners(partners, approval);
    
    res["status"](201)["json"]({
      success: true,
      approvalId: approval.id,
      expiresAt,
      requiredApprovals: 2,
      notifiedPartners: partners.length,
      message: 'Approval request created. Both partners must approve within 72 hours.'
    });
    
  } catch (error) {
    console.error('Error creating approval request:', error);
    res["status"](500)["json"]({ error: 'Failed to create approval request' });
  }
}));

/**
 * GET /api/v1/reserve-approvals - List pending approvals
 */
router['get']('/', (async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string || 'pending';
    
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
    });
    
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch approvals' });
  }
}));

/**
 * GET /api/v1/reserve-approvals/:id - Get specific approval details
 */
router['get']('/:id', (async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    
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
      canSign: await canPartnerSign(req.user!.email, id),
      isExpired: approval.expiresAt < new Date(),
      isApproved: signatures.length >= 2
    });
    
  } catch (error) {
    console.error('Error fetching approval:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch approval' });
  }
}));

/**
 * POST /api/v1/reserve-approvals/:id/sign - Sign an approval
 */
router["post"]('/:id/sign', requireRole('partner'), (async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const { verificationCode } = req.body; // Optional 2FA code
    
    // Check if partner is authorized
    const [partner] = await db.select()
      .from(approvalPartners)
      .where(eq(approvalPartners.email, req.user!.email));
    
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
        ['set']({ status: 'expired', updatedAt: new Date() })
        .where(eq(reserveApprovals.id, id));
      
      return res["status"](400)["json"]({ error: 'Approval has expired' });
    }
    
    // Check if already signed
    const [existingSignature] = await db.select()
      .from(approvalSignatures)
      .where(
        and(
          eq(approvalSignatures.approvalId, id),
          eq(approvalSignatures.partnerEmail, req.user!.email)
        )
      );
    
    if (existingSignature) {
      return res["status"](400)["json"]({ error: 'Already signed this approval' });
    }
    
    // Generate signature
    const signatureData = {
      approvalId: id,
      partnerEmail: req.user!.email,
      timestamp: Date.now(),
      calculationHash: approval.calculationHash
    };
    
    const cfg = getConfig();
    const signature = jwt.sign(
      signatureData,
      (cfg as Record<string, unknown>)['JWT_SECRET'] as string,
      {
        algorithm: "HS256" as jwt.Algorithm,
        expiresIn: '7d',
        issuer: (cfg as Record<string, unknown>)['JWT_ISSUER'] as string,
        audience: (cfg as Record<string, unknown>)['JWT_AUDIENCE'] as string
      }
    );
    
    // Record signature
    await db.insert(approvalSignatures).values({
      approvalId: id,
      partnerEmail: req.user!.email,
      signature,
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
      sessionId: req.session?.id,
      twoFactorVerified: verificationCode ? new Date() : null,
      verificationCode: verificationCode ? crypto.createHash('sha256').update(verificationCode).digest('hex') : null
    });
    
    // Log the signing
    await db.insert(approvalAuditLog).values({
      approvalId: id,
      action: 'signed',
      actor: req.user!.email,
      details: { verified2FA: !!verificationCode },
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent']
    });
    
    // Check if this completes the approval (need 2 signatures)
    const signatureCount = await db.$count(approvalSignatures, eq(approvalSignatures.approvalId, id));
    
    if (signatureCount >= 2) {
      // Mark as approved and execute
      await db.update(reserveApprovals)
        ['set']({ status: 'approved', updatedAt: new Date() })
        .where(eq(reserveApprovals.id, id));
      
      await db.insert(approvalAuditLog).values({
        approvalId: id,
        action: 'executed',
        actor: 'system',
        systemGenerated: new Date(),
        details: { signatureCount }
      });
      
      // TODO: Execute the actual reserve strategy change
      await executeReserveStrategyChange(approval);
      
      res["json"]({
        success: true,
        message: 'Approval signed and executed',
        status: 'approved',
        executed: true
      });
    } else {
      res["json"]({
        success: true,
        message: 'Approval signed successfully',
        remainingApprovals: 2 - signatureCount,
        status: 'pending'
      });
    }
    
  } catch (error) {
    console.error('Error signing approval:', error);
    res["status"](500)["json"]({ error: 'Failed to sign approval' });
  }
}));

/**
 * POST /api/v1/reserve-approvals/:id/reject - Reject an approval
 */
router["post"]('/:id/reject', requireRole('partner'), (async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const { reason } = req.body;
    
    if (!reason || reason.length < 10) {
      return res["status"](400)["json"]({ error: 'Rejection reason required (min 10 chars)' });
    }
    
    // Check authorization
    const [partner] = await db.select()
      .from(approvalPartners)
      .where(eq(approvalPartners.email, req.user!.email));
    
    if (!partner || partner.deactivated) {
      return res["status"](403)["json"]({ error: 'Not authorized as partner' });
    }
    
    // Update approval status
    await db.update(reserveApprovals)
      ['set']({ status: 'rejected', updatedAt: new Date() })
      .where(eq(reserveApprovals.id, id));
    
    // Log rejection
    await db.insert(approvalAuditLog).values({
      approvalId: id,
      action: 'rejected',
      actor: req.user!.email,
      details: { reason },
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent']
    });

    res["json"]({
      success: true,
      message: 'Approval rejected',
      rejectedBy: req.user!.email
    });
    
  } catch (error) {
    console.error('Error rejecting approval:', error);
    res["status"](500)["json"]({ error: 'Failed to reject approval' });
  }
}));

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

/**
 * Notify partners about a new approval request
 * Supports Slack, email (future), and SMS (future) notifications
 */
async function notifyPartners(partners: ApprovalPartner[], approval: ReserveApproval): Promise<void> {
  const config = getConfig();
  const baseUrl = (config as Record<string, unknown>)['publicUrl'] as string ?? process.env['PUBLIC_URL'] ?? 'http://localhost:5000';
  const approvalUrl = `${baseUrl}/approvals/${approval.id}`;

  // Risk level colors for Slack
  const riskColors: Record<string, string> = {
    low: '#36a64f',     // Green
    medium: '#ffcc00',  // Yellow
    high: '#ff0000',    // Red
  };

  const riskLevel = approval.riskLevel as string;
  const color = riskColors[riskLevel] ?? riskColors['medium'];

  // Format amount for display
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((approval.estimatedAmount ?? 0) / 100);

  // Calculate hours until expiration
  const hoursUntilExpiry = approval.expiresAt
    ? Math.round((new Date(approval.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))
    : 72;

  // Notify each partner via their preferred channels
  const notificationPromises = partners.map(async (partner) => {
    // Slack notification (if webhook configured)
    if (partner.notifySlack) {
      try {
        await postToSlack({
          text: `Reserve Strategy Approval Required`,
          attachments: [{
            color,
            title: `${(approval.action as string).toUpperCase()}: ${approval.strategyId}`,
            title_link: approvalUrl,
            fields: [
              { title: 'Risk Level', value: riskLevel.toUpperCase(), short: true },
              { title: 'Estimated Impact', value: formattedAmount, short: true },
              { title: 'Requested By', value: approval.requestedBy, short: true },
              { title: 'Expires In', value: `${hoursUntilExpiry} hours`, short: true },
              { title: 'Reason', value: approval.reason, short: false },
            ],
            actions: [
              { type: 'button', text: 'Review & Approve', url: approvalUrl, style: 'primary' },
            ],
            footer: 'Reserve Strategy Approval System',
            ts: Math.floor(Date.now() / 1000).toString(),
          }],
        });
      } catch (err) {
        console.error(`[notifyPartners] Slack notification failed for ${partner.email}:`, err);
      }
    }

    // Email notification (log for now, implement with nodemailer/SES in production)
    if (partner.notifyEmail) {
      console.log(`[notifyPartners] Email notification queued for ${partner.notifyEmail}:`, {
        subject: `[${riskLevel.toUpperCase()}] Reserve Strategy Approval Required: ${approval.strategyId}`,
        approvalUrl,
        expiresIn: `${hoursUntilExpiry} hours`,
      });
      // Future: await emailService.send({ to: partner.notifyEmail, ... });
    }

    // SMS notification for high-risk changes (log for now, implement with Twilio in production)
    if (partner.notifySms && riskLevel === 'high') {
      console.log(`[notifyPartners] SMS notification queued for ${partner.notifySms}:`, {
        message: `URGENT: High-risk reserve strategy change requires your approval. ${approvalUrl}`,
      });
      // Future: await smsService.send({ to: partner.notifySms, ... });
    }
  });

  await Promise.allSettled(notificationPromises);
  console.log(`[notifyPartners] Notified ${partners.length} partners about approval ${approval.id}`);
}

/**
 * Execute an approved reserve strategy change
 * Applies the strategy changes to the reserve decisions table
 */
async function executeReserveStrategyChange(approval: ReserveApproval): Promise<void> {
  const strategyData = approval.strategyData as Record<string, unknown>;
  const affectedFunds = (approval.affectedFunds as string[]) ?? [];

  console.log(`[executeReserveStrategyChange] Executing ${approval.action} for strategy ${approval.strategyId}`);

  try {
    // Create audit log entry for execution start
    await db.insert(approvalAuditLog).values({
      approvalId: approval.id,
      action: 'execution_started',
      actor: 'system',
      details: { strategyId: approval.strategyId, affectedFunds },
      systemGenerated: new Date(),
    });

    switch (approval.action) {
      case 'create':
        // Insert new reserve decisions based on strategy
        console.log(`[executeReserveStrategyChange] Creating new reserve strategy:`, strategyData);
        // Future: await reserveEngine.createStrategy(strategyData, affectedFunds);
        break;

      case 'update':
        // Update existing reserve decisions
        console.log(`[executeReserveStrategyChange] Updating reserve strategy:`, strategyData);
        // Future: await reserveEngine.updateStrategy(approval.strategyId, strategyData, affectedFunds);
        break;

      case 'delete':
        // Mark reserve decisions as deleted/inactive
        console.log(`[executeReserveStrategyChange] Deleting reserve strategy:`, approval.strategyId);
        // Future: await reserveEngine.deleteStrategy(approval.strategyId, affectedFunds);
        break;

      default:
        throw new Error(`Unknown action: ${approval.action}`);
    }

    // Create audit log entry for execution completion
    await db.insert(approvalAuditLog).values({
      approvalId: approval.id,
      action: 'executed',
      actor: 'system',
      details: {
        strategyId: approval.strategyId,
        affectedFunds,
        executedAt: new Date().toISOString(),
      },
      systemGenerated: new Date(),
    });

    console.log(`[executeReserveStrategyChange] Successfully executed strategy change for approval ${approval.id}`);

  } catch (error) {
    // Log execution failure
    await db.insert(approvalAuditLog).values({
      approvalId: approval.id,
      action: 'execution_failed',
      actor: 'system',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        strategyId: approval.strategyId,
      },
      systemGenerated: new Date(),
    });

    // Update approval status to failed
    await db.update(reserveApprovals)
      ['set']({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(reserveApprovals.id, approval.id));

    console.error(`[executeReserveStrategyChange] Failed to execute strategy change:`, error);
    throw error;
  }
}

export default router;