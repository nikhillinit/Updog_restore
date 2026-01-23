/**
 * Shares API Routes
 *
 * Endpoints for creating and managing share links for fund dashboards.
 *
 * POST   /api/shares              - Create a share link
 * GET    /api/shares              - List shares for a fund
 * GET    /api/shares/:shareId     - Get share details (public, with passkey if required)
 * PATCH  /api/shares/:shareId     - Update share configuration
 * DELETE /api/shares/:shareId     - Revoke (deactivate) a share
 * POST   /api/shares/:shareId/verify - Verify passkey
 * GET    /api/shares/:shareId/analytics - Get share analytics
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { shares, shareAnalytics, SHARE_ACCESS_LEVELS } from '@shared/schema/shares';
import { eq, and, desc } from 'drizzle-orm';
import { CreateShareLinkSchema, LP_HIDDEN_METRICS } from '@shared/sharing-schema';

const router = Router();

// Validation schemas
const CreateShareRequestSchema = z.object({
  fundId: z.string().min(1),
  accessLevel: z.enum(SHARE_ACCESS_LEVELS).default('view_only'),
  requirePasskey: z.boolean().default(false),
  passkey: z.string().min(4).max(50).optional(),
  expiresInDays: z.number().min(1).max(365).optional(),
  hiddenMetrics: z.array(z.string()).default([...LP_HIDDEN_METRICS]),
  customTitle: z.string().max(100).optional(),
  customMessage: z.string().max(500).optional(),
});

const UpdateShareRequestSchema = z.object({
  accessLevel: z.enum(SHARE_ACCESS_LEVELS).optional(),
  requirePasskey: z.boolean().optional(),
  passkey: z.string().min(4).max(50).optional(),
  expiresInDays: z.number().min(1).max(365).nullable().optional(),
  hiddenMetrics: z.array(z.string()).optional(),
  customTitle: z.string().max(100).nullable().optional(),
  customMessage: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

const VerifyPasskeySchema = z.object({
  passkey: z.string().min(1),
});

/**
 * POST /api/shares - Create a share link
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateShareRequestSchema.parse(req.body);
    const userId = (req as Request & { user?: { id: string } }).user?.id ?? 'anonymous';

    // Hash passkey if provided
    let passkeyHash: string | null = null;
    if (body.requirePasskey && body.passkey) {
      passkeyHash = await bcrypt.hash(body.passkey, 10);
    }

    // Calculate expiration date
    let expiresAt: Date | null = null;
    if (body.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
    }

    const shareId = uuidv4();
    const now = new Date();

    const [share] = await db
      .insert(shares)
      .values({
        id: shareId,
        fundId: body.fundId,
        createdBy: userId,
        accessLevel: body.accessLevel,
        requirePasskey: body.requirePasskey,
        passkeyHash,
        expiresAt,
        hiddenMetrics: body.hiddenMetrics,
        customTitle: body.customTitle ?? null,
        customMessage: body.customMessage ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({
      success: true,
      share: {
        id: share.id,
        fundId: share.fundId,
        accessLevel: share.accessLevel,
        requirePasskey: share.requirePasskey,
        expiresAt: share.expiresAt,
        hiddenMetrics: share.hiddenMetrics,
        customTitle: share.customTitle,
        customMessage: share.customMessage,
        shareUrl: `/share/${share.id}`,
        createdAt: share.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * GET /api/shares - List shares for a fund
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fundId = req.query['fundId'] as string;
    if (!fundId) {
      return res.status(400).json({ success: false, error: 'fundId query parameter required' });
    }

    const fundShares = await db
      .select({
        id: shares.id,
        fundId: shares.fundId,
        accessLevel: shares.accessLevel,
        requirePasskey: shares.requirePasskey,
        expiresAt: shares.expiresAt,
        hiddenMetrics: shares.hiddenMetrics,
        customTitle: shares.customTitle,
        viewCount: shares.viewCount,
        lastViewedAt: shares.lastViewedAt,
        isActive: shares.isActive,
        createdAt: shares.createdAt,
      })
      .from(shares)
      .where(eq(shares.fundId, fundId))
      .orderBy(desc(shares.createdAt));

    res.json({
      success: true,
      shares: fundShares,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shares/:shareId - Get share details (public endpoint)
 */
router.get('/:shareId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;

    const [share] = await db
      .select()
      .from(shares)
      .where(eq(shares.id, shareId))
      .limit(1);

    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    if (!share.isActive) {
      return res.status(410).json({ success: false, error: 'Share has been revoked' });
    }

    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ success: false, error: 'Share has expired' });
    }

    // If passkey required, don't return full details
    if (share.requirePasskey) {
      return res.json({
        success: true,
        share: {
          id: share.id,
          requirePasskey: true,
          customTitle: share.customTitle,
          customMessage: share.customMessage,
        },
      });
    }

    // Record view
    await recordShareView(shareId, req);

    res.json({
      success: true,
      share: {
        id: share.id,
        fundId: share.fundId,
        accessLevel: share.accessLevel,
        hiddenMetrics: share.hiddenMetrics,
        customTitle: share.customTitle,
        customMessage: share.customMessage,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shares/:shareId/verify - Verify passkey
 */
router.post('/:shareId/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;
    const { passkey } = VerifyPasskeySchema.parse(req.body);

    const [share] = await db
      .select()
      .from(shares)
      .where(eq(shares.id, shareId))
      .limit(1);

    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    if (!share.isActive) {
      return res.status(410).json({ success: false, error: 'Share has been revoked' });
    }

    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ success: false, error: 'Share has expired' });
    }

    if (!share.passkeyHash) {
      return res.status(400).json({ success: false, error: 'Share does not require passkey' });
    }

    const isValid = await bcrypt.compare(passkey, share.passkeyHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid passkey' });
    }

    // Record view
    await recordShareView(shareId, req);

    res.json({
      success: true,
      share: {
        id: share.id,
        fundId: share.fundId,
        accessLevel: share.accessLevel,
        hiddenMetrics: share.hiddenMetrics,
        customTitle: share.customTitle,
        customMessage: share.customMessage,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * PATCH /api/shares/:shareId - Update share configuration
 */
router.patch('/:shareId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;
    const body = UpdateShareRequestSchema.parse(req.body);

    const [existingShare] = await db
      .select()
      .from(shares)
      .where(eq(shares.id, shareId))
      .limit(1);

    if (!existingShare) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    // Build update object
    const updates: Partial<typeof shares.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.accessLevel !== undefined) updates.accessLevel = body.accessLevel;
    if (body.requirePasskey !== undefined) updates.requirePasskey = body.requirePasskey;
    if (body.passkey !== undefined) {
      updates.passkeyHash = await bcrypt.hash(body.passkey, 10);
    }
    if (body.expiresInDays !== undefined) {
      if (body.expiresInDays === null) {
        updates.expiresAt = null;
      } else {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
        updates.expiresAt = expiresAt;
      }
    }
    if (body.hiddenMetrics !== undefined) updates.hiddenMetrics = body.hiddenMetrics;
    if (body.customTitle !== undefined) updates.customTitle = body.customTitle;
    if (body.customMessage !== undefined) updates.customMessage = body.customMessage;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updatedShare] = await db
      .update(shares)
      .set(updates)
      .where(eq(shares.id, shareId))
      .returning();

    res.json({
      success: true,
      share: {
        id: updatedShare.id,
        fundId: updatedShare.fundId,
        accessLevel: updatedShare.accessLevel,
        requirePasskey: updatedShare.requirePasskey,
        expiresAt: updatedShare.expiresAt,
        hiddenMetrics: updatedShare.hiddenMetrics,
        customTitle: updatedShare.customTitle,
        customMessage: updatedShare.customMessage,
        isActive: updatedShare.isActive,
        updatedAt: updatedShare.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/shares/:shareId - Revoke (deactivate) a share
 */
router.delete('/:shareId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;

    const [share] = await db
      .update(shares)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(shares.id, shareId))
      .returning();

    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    res.json({ success: true, message: 'Share revoked successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shares/:shareId/analytics - Get share analytics
 */
router.get('/:shareId/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;

    const [share] = await db
      .select()
      .from(shares)
      .where(eq(shares.id, shareId))
      .limit(1);

    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    const analytics = await db
      .select()
      .from(shareAnalytics)
      .where(eq(shareAnalytics.shareId, shareId))
      .orderBy(desc(shareAnalytics.viewedAt))
      .limit(100);

    res.json({
      success: true,
      summary: {
        totalViews: share.viewCount,
        lastViewedAt: share.lastViewedAt,
      },
      views: analytics,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper: Record share view
 */
async function recordShareView(shareId: string, req: Request) {
  const viewerIp = req.ip ?? req.socket.remoteAddress ?? null;
  const userAgent = req.get('user-agent') ?? null;

  // Update share view count
  await db
    .update(shares)
    .set({
      viewCount: db.raw('view_count + 1'),
      lastViewedAt: new Date(),
    } as any)
    .where(eq(shares.id, shareId));

  // Record analytics
  await db.insert(shareAnalytics).values({
    id: uuidv4(),
    shareId,
    viewerIp,
    userAgent,
    viewedAt: new Date(),
  });
}

export const sharesRouter = router;
