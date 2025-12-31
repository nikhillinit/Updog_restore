/**
 * LP Capital Calls API Routes
 *
 * Sprint 3 endpoints for capital call management (TC-LP-003):
 * - GET /api/lp/capital-calls - List capital calls
 * - GET /api/lp/capital-calls/:callId - Get call details
 * - GET /api/lp/capital-calls/:callId/wire-instructions - Get wire instructions
 * - POST /api/lp/capital-calls/:callId/payment - Submit payment confirmation
 *
 * @module server/routes/lp-capital-calls
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../lib/auth/jwt';
import { requireLPAccess } from '../middleware/requireLPAccess';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { lpCapitalCalls, lpPaymentSubmissions } from '@shared/schema-lp-sprint3';
import { funds } from '@shared/schema';
import { v4 as uuidv4 } from 'uuid';
import { createCursor, verifyCursor } from '../lib/crypto/cursor-signing';
import { sanitizeForLogging } from '../lib/crypto/pii-sanitizer';
import { lpAuditLogger } from '../services/lp-audit-logger';
import { recordLPRequest, recordError, startTimer } from '../observability/lp-metrics';

const router = Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

const capitalCallsLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CapitalCallsQuerySchema = z.object({
  status: z.enum(['pending', 'due', 'overdue', 'paid', 'partial']).optional(),
  fundId: z.coerce.number().positive().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const PaymentSubmissionSchema = z.object({
  amount: z.number().positive('Payment amount must be positive'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  referenceNumber: z.string().min(1, 'Reference number is required'),
  notes: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  idempotencyKey: z.string().optional(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface LPApiError {
  error: string;
  message: string;
  field?: string;
  timestamp: string;
}

function createErrorResponse(code: string, message: string, field?: string): LPApiError {
  const response: LPApiError = {
    error: code,
    message,
    timestamp: new Date().toISOString(),
  };
  if (field !== undefined) {
    response.field = field;
  }
  return response;
}

function formatCentsAsString(cents: bigint | null | undefined): string {
  return (cents ?? 0n).toString();
}

// ============================================================================
// GET /api/lp/capital-calls
// ============================================================================

/**
 * List capital calls for the authenticated LP
 *
 * Query parameters:
 * - status: Filter by status (pending, due, overdue, paid, partial)
 * - fundId: Filter by fund ID
 * - limit: Number of results (max 100)
 * - cursor: Pagination cursor
 */
router.get(
  '/api/lp/capital-calls',
  requireAuth(),
  requireLPAccess,
  capitalCallsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/capital-calls';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        recordError(endpoint, 'LP_NOT_FOUND', 404);
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Validate query parameters
      const query = CapitalCallsQuerySchema.parse(req.query);

      // Verify and decode cursor if provided
      let startOffset = 0;
      if (query.cursor) {
        try {
          const cursorPayload = verifyCursor<{ offset: number; limit: number }>(query.cursor);
          startOffset = cursorPayload.offset;
        } catch {
          const duration = endTimer();
          recordLPRequest(endpoint, 'GET', 400, duration, lpId);
          recordError(endpoint, 'INVALID_CURSOR', 400);
          return res
            .status(400)
            .json(
              createErrorResponse('INVALID_CURSOR', 'Pagination cursor is invalid or tampered')
            );
        }
      }

      // Build query conditions
      const conditions = [eq(lpCapitalCalls.lpId, lpId)];

      if (query.status) {
        conditions.push(eq(lpCapitalCalls.status, query.status));
      }

      if (query.fundId) {
        conditions.push(eq(lpCapitalCalls.fundId, query.fundId));
      }

      // Query capital calls with fund name
      const calls = await db
        .select({
          id: lpCapitalCalls.id,
          lpId: lpCapitalCalls.lpId,
          fundId: lpCapitalCalls.fundId,
          fundName: funds.name,
          callNumber: lpCapitalCalls.callNumber,
          callAmountCents: lpCapitalCalls.callAmountCents,
          dueDate: lpCapitalCalls.dueDate,
          callDate: lpCapitalCalls.callDate,
          purpose: lpCapitalCalls.purpose,
          status: lpCapitalCalls.status,
          paidAmountCents: lpCapitalCalls.paidAmountCents,
          createdAt: lpCapitalCalls.createdAt,
        })
        .from(lpCapitalCalls)
        .leftJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
        .where(and(...conditions))
        .orderBy(desc(lpCapitalCalls.callDate), desc(lpCapitalCalls.id))
        .limit(query.limit + 1) // Fetch one extra to check hasMore
        .offset(startOffset);

      // Check if there are more results
      const hasMore = calls.length > query.limit;
      const paginatedCalls = hasMore ? calls.slice(0, query.limit) : calls;

      // Calculate pending summary
      const pendingCalls = paginatedCalls.filter(
        (c) => c.status === 'pending' || c.status === 'due' || c.status === 'overdue'
      );
      const totalPendingAmount = pendingCalls.reduce(
        (sum, c) => sum + (c.callAmountCents ?? 0n) - (c.paidAmountCents ?? 0n),
        0n
      );

      // Format response
      const responseCalls = paginatedCalls.map((c) => ({
        id: c.id,
        fundId: c.fundId,
        fundName: c.fundName ?? 'Unknown Fund',
        callNumber: c.callNumber,
        callAmount: formatCentsAsString(c.callAmountCents),
        dueDate: c.dueDate,
        callDate: c.callDate,
        purpose: c.purpose,
        status: c.status,
        paidAmount: formatCentsAsString(c.paidAmountCents),
        remainingBalance: formatCentsAsString(
          (c.callAmountCents ?? 0n) - (c.paidAmountCents ?? 0n)
        ),
      }));

      // Create signed cursor for next page
      const nextCursor = hasMore
        ? createCursor({ offset: startOffset + query.limit, limit: query.limit })
        : null;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      // Audit log
      await lpAuditLogger.logCapitalCallsListView(lpId, req.user?.id, req);

      return res.json({
        calls: responseCalls,
        nextCursor,
        hasMore,
        totalPending: pendingCalls.length,
        totalPendingAmount: formatCentsAsString(totalPendingAmount),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 400, duration);
        recordError(endpoint, 'VALIDATION_ERROR', 400);
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              firstError?.message || 'Invalid query parameters',
              firstError?.path.join('.')
            )
          );
      }

      console.error('Capital calls list API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch capital calls'));
    }
  }
);

// ============================================================================
// GET /api/lp/capital-calls/:callId
// ============================================================================

/**
 * Get capital call details
 */
router.get(
  '/api/lp/capital-calls/:callId',
  requireAuth(),
  requireLPAccess,
  capitalCallsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/capital-calls/:callId';

    try {
      const lpId = req.lpProfile?.id;
      const callId = req.params['callId'];

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      if (!callId) {
        return res.status(400).json(createErrorResponse('INVALID_REQUEST', 'Call ID is required'));
      }

      // Fetch capital call
      const calls = await db
        .select({
          id: lpCapitalCalls.id,
          lpId: lpCapitalCalls.lpId,
          fundId: lpCapitalCalls.fundId,
          fundName: funds.name,
          callNumber: lpCapitalCalls.callNumber,
          callAmountCents: lpCapitalCalls.callAmountCents,
          dueDate: lpCapitalCalls.dueDate,
          callDate: lpCapitalCalls.callDate,
          purpose: lpCapitalCalls.purpose,
          status: lpCapitalCalls.status,
          paidAmountCents: lpCapitalCalls.paidAmountCents,
          paidDate: lpCapitalCalls.paidDate,
          createdAt: lpCapitalCalls.createdAt,
          updatedAt: lpCapitalCalls.updatedAt,
        })
        .from(lpCapitalCalls)
        .leftJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
        .where(eq(lpCapitalCalls.id, callId))
        .limit(1);

      if (calls.length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration, lpId);
        return res
          .status(404)
          .json(createErrorResponse('CALL_NOT_FOUND', `Capital call ${callId} not found`));
      }

      const call = calls[0];
      if (!call) {
        return res
          .status(404)
          .json(createErrorResponse('CALL_NOT_FOUND', `Capital call ${callId} not found`));
      }

      // Verify LP owns this call
      if (call.lpId !== lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 403, duration, lpId);
        return res
          .status(403)
          .json(createErrorResponse('FORBIDDEN', 'You do not have access to this capital call'));
      }

      // Fetch payment submissions
      const submissions = await db
        .select({
          id: lpPaymentSubmissions.id,
          amountCents: lpPaymentSubmissions.amountCents,
          paymentDate: lpPaymentSubmissions.paymentDate,
          referenceNumber: lpPaymentSubmissions.referenceNumber,
          status: lpPaymentSubmissions.status,
          submittedBy: lpPaymentSubmissions.submittedBy,
          confirmedAt: lpPaymentSubmissions.confirmedAt,
          createdAt: lpPaymentSubmissions.createdAt,
        })
        .from(lpPaymentSubmissions)
        .where(eq(lpPaymentSubmissions.callId, callId))
        .orderBy(desc(lpPaymentSubmissions.createdAt));

      const response = {
        id: call.id,
        lpId: call.lpId,
        fundId: call.fundId,
        fundName: call.fundName ?? 'Unknown Fund',
        callNumber: call.callNumber,
        callAmount: formatCentsAsString(call.callAmountCents),
        dueDate: call.dueDate,
        callDate: call.callDate,
        purpose: call.purpose,
        status: call.status,
        paidAmount: formatCentsAsString(call.paidAmountCents),
        paidDate: call.paidDate,
        remainingBalance: formatCentsAsString(
          (call.callAmountCents ?? 0n) - (call.paidAmountCents ?? 0n)
        ),
        paymentSubmissions: submissions.map((s) => ({
          id: s.id,
          amount: formatCentsAsString(s.amountCents),
          paymentDate: s.paymentDate,
          referenceNumber: s.referenceNumber,
          status: s.status,
          confirmedAt: s.confirmedAt?.toISOString(),
          createdAt: s.createdAt.toISOString(),
        })),
        createdAt: call.createdAt.toISOString(),
        updatedAt: call.updatedAt.toISOString(),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      // Audit log
      await lpAuditLogger.logCapitalCallDetailView(lpId, callId, req.user?.id, req);

      return res.json(response);
    } catch (error) {
      console.error('Capital call detail API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch capital call'));
    }
  }
);

// ============================================================================
// GET /api/lp/capital-calls/:callId/wire-instructions
// ============================================================================

/**
 * Get wire instructions for a capital call
 *
 * Wire instructions are masked for security.
 * Access is logged for audit compliance.
 */
router.get(
  '/api/lp/capital-calls/:callId/wire-instructions',
  requireAuth(),
  requireLPAccess,
  capitalCallsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/capital-calls/:callId/wire-instructions';

    try {
      const lpId = req.lpProfile?.id;
      const callId = req.params['callId'];

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      if (!callId) {
        return res.status(400).json(createErrorResponse('INVALID_REQUEST', 'Call ID is required'));
      }

      // Fetch capital call with wire instructions
      const calls = await db
        .select({
          id: lpCapitalCalls.id,
          lpId: lpCapitalCalls.lpId,
          callAmountCents: lpCapitalCalls.callAmountCents,
          dueDate: lpCapitalCalls.dueDate,
          status: lpCapitalCalls.status,
          wireInstructions: lpCapitalCalls.wireInstructions,
        })
        .from(lpCapitalCalls)
        .where(eq(lpCapitalCalls.id, callId))
        .limit(1);

      if (calls.length === 0) {
        return res
          .status(404)
          .json(createErrorResponse('CALL_NOT_FOUND', `Capital call ${callId} not found`));
      }

      const call = calls[0];
      if (!call) {
        return res
          .status(404)
          .json(createErrorResponse('CALL_NOT_FOUND', `Capital call ${callId} not found`));
      }

      // Verify LP owns this call
      if (call.lpId !== lpId) {
        return res
          .status(403)
          .json(createErrorResponse('FORBIDDEN', 'You do not have access to this capital call'));
      }

      // Wire instructions are already masked in the database
      const wireInstructions = call.wireInstructions as {
        bankName: string;
        accountName: string;
        accountNumber: string;
        routingNumber: string;
        swiftCode?: string;
        reference: string;
      };

      const response = {
        ...wireInstructions,
        callAmount: formatCentsAsString(call.callAmountCents),
        dueDate: call.dueDate,
        status: call.status,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      // CRITICAL: Audit log for wire instruction access (SOC2 compliance)
      await lpAuditLogger.logWireInstructionsAccess(lpId, callId, req.user?.id, req);

      return res.json(response);
    } catch (error) {
      console.error('Wire instructions API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch wire instructions'));
    }
  }
);

// ============================================================================
// POST /api/lp/capital-calls/:callId/payment
// ============================================================================

/**
 * Submit payment confirmation for a capital call
 *
 * This creates a payment submission that must be confirmed by a GP.
 */
router.post(
  '/api/lp/capital-calls/:callId/payment',
  requireAuth(),
  requireLPAccess,
  capitalCallsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/capital-calls/:callId/payment';

    try {
      const lpId = req.lpProfile?.id;
      const callId = req.params['callId'];
      const userId = req.user?.id as string | number | undefined;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      if (!callId) {
        return res.status(400).json(createErrorResponse('INVALID_REQUEST', 'Call ID is required'));
      }

      // Validate request body
      const payment = PaymentSubmissionSchema.parse(req.body);

      // Fetch capital call
      const calls = await db
        .select({
          id: lpCapitalCalls.id,
          lpId: lpCapitalCalls.lpId,
          callAmountCents: lpCapitalCalls.callAmountCents,
          paidAmountCents: lpCapitalCalls.paidAmountCents,
          status: lpCapitalCalls.status,
          version: lpCapitalCalls.version,
        })
        .from(lpCapitalCalls)
        .where(eq(lpCapitalCalls.id, callId))
        .limit(1);

      if (calls.length === 0) {
        return res
          .status(404)
          .json(createErrorResponse('CALL_NOT_FOUND', `Capital call ${callId} not found`));
      }

      const call = calls[0];
      if (!call) {
        return res
          .status(404)
          .json(createErrorResponse('CALL_NOT_FOUND', `Capital call ${callId} not found`));
      }

      // Verify LP owns this call
      if (call.lpId !== lpId) {
        return res
          .status(403)
          .json(createErrorResponse('FORBIDDEN', 'You do not have access to this capital call'));
      }

      // Check if call is already fully paid
      if (call.status === 'paid') {
        return res
          .status(400)
          .json(
            createErrorResponse(
              'CALL_ALREADY_PAID',
              'This capital call has already been paid in full'
            )
          );
      }

      // Calculate remaining balance
      const remainingBalance = (call.callAmountCents ?? 0n) - (call.paidAmountCents ?? 0n);
      const paymentAmountCents = BigInt(payment.amount);

      // Validate payment doesn't exceed remaining balance
      if (paymentAmountCents > remainingBalance) {
        return res.status(400).json({
          error: 'PAYMENT_EXCEEDS_BALANCE',
          message: 'Payment amount exceeds remaining balance',
          remainingBalance: remainingBalance.toString(),
          timestamp: new Date().toISOString(),
        });
      }

      // Check for idempotent submission
      if (payment.idempotencyKey) {
        const existing = await db
          .select({ id: lpPaymentSubmissions.id, status: lpPaymentSubmissions.status })
          .from(lpPaymentSubmissions)
          .where(
            and(
              eq(lpPaymentSubmissions.callId, callId),
              sql`${lpPaymentSubmissions.notes} LIKE ${`%${payment.idempotencyKey}%`}`
            )
          )
          .limit(1);

        if (existing.length > 0) {
          return res.json({
            success: true,
            submission: existing[0],
            duplicate: true,
            message: 'Payment submission already exists',
          });
        }
      }

      // Create payment submission
      const submissionId = uuidv4();
      const notesValue = payment.idempotencyKey
        ? `${payment.notes || ''} [idempotency:${payment.idempotencyKey}]`
        : payment.notes;

      // Convert userId to number for DB (if it's a string)
      let submittedByNum: number | null = null;
      if (userId !== undefined) {
        if (typeof userId === 'number') {
          submittedByNum = userId;
        } else {
          const parsed = parseInt(String(userId), 10);
          if (!Number.isNaN(parsed)) {
            submittedByNum = parsed;
          }
        }
      }

      await db.insert(lpPaymentSubmissions).values({
        id: submissionId,
        callId,
        amountCents: paymentAmountCents,
        paymentDate: payment.paymentDate,
        referenceNumber: payment.referenceNumber,
        receiptUrl: payment.receiptUrl ?? null,
        status: 'pending',
        submittedBy: submittedByNum,
        notes: notesValue ?? null,
      });

      res.setHeader('Content-Type', 'application/json');

      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 201, duration, lpId);

      // Audit log
      await lpAuditLogger.logPaymentSubmission(lpId, callId, submissionId, req.user?.id, req);

      return res.status(201).json({
        success: true,
        submission: {
          id: submissionId,
          callId,
          amount: paymentAmountCents.toString(),
          status: 'pending',
          referenceNumber: payment.referenceNumber,
          paymentDate: payment.paymentDate,
        },
        message: 'Payment confirmation submitted. Awaiting GP verification.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const duration = endTimer();
        recordLPRequest(endpoint, 'POST', 400, duration);
        recordError(endpoint, 'VALIDATION_ERROR', 400);
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              firstError?.message || 'Invalid payment data',
              firstError?.path.join('.')
            )
          );
      }

      console.error('Payment submission API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to submit payment'));
    }
  }
);

export default router;
