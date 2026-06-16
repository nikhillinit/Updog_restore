/**
 * Shares API Routes
 *
 * /api/shares is authenticated share management.
 * /api/public/shares is the anonymous public snapshot boundary.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  shares,
  shareAnalytics,
  SHARE_ACCESS_LEVELS,
  type Share,
  type ShareSnapshotRecord,
} from '@shared/schema/shares';
import { LP_HIDDEN_METRICS } from '@shared/sharing-schema';
import { firstString } from '../lib/request-values';
import { parseETag } from '../lib/http-preconditions';
import {
  createShareSnapshot,
  getLatestShareSnapshot,
  markShareSnapshotsRevoked,
} from '../services/share-snapshot-service';
import { logger } from '../lib/logger.js';
import { stableJson } from '../lib/stable-json.js';

const HASH_ITERATIONS = 100000;
const HASH_KEY_LENGTH = 64;
const HASH_ALGORITHM = 'sha512';

function hashPasskey(passkey: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(passkey, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasskey(passkey: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto
    .pbkdf2Sync(passkey, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verifyHash));
}

const managementRouter = Router();
const publicRouter = Router();

function publicShareRateLimitKey(req: Request): string {
  const ipKey = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  return `${ipKey}:share:${req.params['shareId'] ?? 'unknown'}`;
}

const publicShareReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: publicShareRateLimitKey,
  message: {
    success: false,
    error: 'too_many_requests',
    message: 'Too many public share requests. Please try again later.',
  },
});

const publicShareVerifyLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: publicShareRateLimitKey,
  message: {
    success: false,
    error: 'too_many_requests',
    message: 'Too many passkey attempts. Please try again later.',
  },
});

const CreateShareRequestSchema = z
  .object({
    fundId: z.string().min(1),
    accessLevel: z.enum(SHARE_ACCESS_LEVELS).default('view_only'),
    requirePasskey: z.boolean().default(false),
    passkey: z.string().min(4).max(50).optional(),
    expiresInDays: z.number().min(1).max(365).optional(),
    hiddenMetrics: z.array(z.string()).default([...LP_HIDDEN_METRICS]),
    customTitle: z.string().max(100).optional(),
    customMessage: z.string().max(500).optional(),
    clientRequestId: z.string().min(1).max(128).optional(),
  })
  .refine((value) => !value.requirePasskey || Boolean(value.passkey), {
    path: ['passkey'],
    message: 'passkey is required when requirePasskey is true',
  });

const UpdateShareRequestSchema = z
  .object({
    accessLevel: z.enum(SHARE_ACCESS_LEVELS).optional(),
    requirePasskey: z.boolean().optional(),
    passkey: z.string().min(4).max(50).optional(),
    expiresInDays: z.number().min(1).max(365).nullable().optional(),
    hiddenMetrics: z.array(z.string()).optional(),
    customTitle: z.string().max(100).nullable().optional(),
    customMessage: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.requirePasskey !== true || Boolean(value.passkey), {
    path: ['passkey'],
    message: 'passkey is required when enabling passkey protection',
  });

const VerifyPasskeySchema = z.object({
  passkey: z.string().min(1),
});

type CreateShareRequest = z.infer<typeof CreateShareRequestSchema>;

function versionETag(share: Pick<Share, 'version'>): string {
  return `"${share.version}"`;
}

function createShareRequestHash(body: z.infer<typeof CreateShareRequestSchema>): string {
  // Passkey is intentionally part of the fingerprint: retrying with a new
  // passkey is a different effective create request and needs a new key.
  const { clientRequestId: _clientRequestId, ...fingerprintBody } = body;
  return crypto
    .createHash('sha256')
    .update(stableJson(fingerprintBody, { omitUndefinedObjectKeys: true }))
    .digest('hex');
}

function getAuthenticatedUserId(req: Request): string | undefined {
  return req.context?.userId ?? req.user?.id;
}

function requireAuthenticatedUser(req: Request, res: Response): string | undefined {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return undefined;
  }
  return userId;
}

function canManageFund(req: Request, fundId: string): boolean {
  if (req.context?.role === 'admin' || req.user?.isAdmin) return true;
  if (req.context?.fundId && req.context.fundId === fundId) return true;

  const numericFundId = Number(fundId);
  if (Number.isFinite(numericFundId) && req.user?.fundIds?.includes(numericFundId)) {
    return true;
  }

  return false;
}

function requireShareVersion(req: Request, res: Response, share: Share): boolean {
  const ifMatch = firstString(req.headers['if-match']);
  if (!ifMatch) {
    res.status(428).json({
      success: false,
      error: 'precondition_required',
      message: 'If-Match header is required for share mutations',
      current: versionETag(share),
    });
    return false;
  }

  if (parseETag(ifMatch) !== String(share.version)) {
    res.status(412).json({
      success: false,
      error: 'precondition_failed',
      message: 'Share has been modified',
      current: versionETag(share),
    });
    return false;
  }

  return true;
}

function serializeManagementShare(share: Share) {
  return {
    id: share.id,
    fundId: share.fundId,
    accessLevel: share.accessLevel,
    requirePasskey: share.requirePasskey,
    expiresAt: share.expiresAt,
    hiddenMetrics: share.hiddenMetrics,
    customTitle: share.customTitle,
    customMessage: share.customMessage,
    isActive: share.isActive,
    version: share.version,
    shareUrl: `/shared/${share.id}`,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  };
}

function resolveCreateExpiresAt(expiresInDays: CreateShareRequest['expiresInDays']): Date | null {
  if (!expiresInDays) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt;
}

function resolveCreatePasskeyHash(
  body: Pick<CreateShareRequest, 'requirePasskey' | 'passkey'>
): string | null {
  if (!body.requirePasskey || !body.passkey) return null;
  return hashPasskey(body.passkey);
}

function buildShareInsertValues(params: {
  body: CreateShareRequest;
  shareId: string;
  userId: string;
  expiresAt: Date | null;
  idempotencyKey: string | undefined;
  idempotencyRequestHash: string;
  now: Date;
}): typeof shares.$inferInsert {
  const { body, shareId, userId, expiresAt, idempotencyKey, idempotencyRequestHash, now } = params;

  return {
    id: shareId,
    fundId: body.fundId,
    createdBy: userId,
    accessLevel: body.accessLevel,
    requirePasskey: body.requirePasskey,
    passkeyHash: resolveCreatePasskeyHash(body),
    expiresAt,
    hiddenMetrics: body.hiddenMetrics,
    customTitle: body.customTitle ?? null,
    customMessage: body.customMessage ?? null,
    idempotencyKey: idempotencyKey ?? null,
    idempotencyRequestHash: idempotencyKey ? idempotencyRequestHash : null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

async function createShareWithSnapshot(
  values: typeof shares.$inferInsert,
  generatedBy: string
): Promise<{ share: Share; snapshot: ShareSnapshotRecord }> {
  return db.transaction(async (tx) => {
    const [createdShare] = await tx.insert(shares).values(values).returning();

    if (!createdShare) {
      throw new Error('Failed to create share');
    }

    const snapshot = await createShareSnapshot(createdShare, generatedBy, tx);
    return { share: createdShare, snapshot };
  });
}

async function findIdempotentShare(
  userId: string,
  idempotencyKey: string
): Promise<Share | undefined> {
  const [existingShare] = await db
    .select()
    .from(shares)
    .where(and(eq(shares.createdBy, userId), eq(shares.idempotencyKey, idempotencyKey)))
    .limit(1);

  return existingShare;
}

function isIdempotencyConflict(existingShare: Share, requestHash: string): boolean {
  return Boolean(
    existingShare.idempotencyRequestHash && existingShare.idempotencyRequestHash !== requestHash
  );
}

function sendIdempotentShareResponse(res: Response, existingShare: Share, requestHash: string) {
  if (isIdempotencyConflict(existingShare, requestHash)) {
    return res.status(409).json({
      success: false,
      error: 'idempotency_key_reused',
      message: 'Idempotency key was already used with a different share request',
    });
  }

  res.setHeader('ETag', versionETag(existingShare));
  return res.status(200).json({
    success: true,
    share: serializeManagementShare(existingShare),
  });
}

async function findShare(shareId: string): Promise<Share | undefined> {
  const [share] = await db.select().from(shares).where(eq(shares.id, shareId)).limit(1);
  return share;
}

async function recordShareView(shareId: string, req: Request) {
  const viewerIp = req.ip ?? req.socket.remoteAddress ?? null;
  const userAgent = req.get('user-agent') ?? null;

  await db
    .update(shares)
    .set({
      viewCount: sql`${shares.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(shares.id, shareId));

  await db.insert(shareAnalytics).values({
    id: uuidv4(),
    shareId,
    viewerIp,
    userAgent,
    viewedAt: new Date(),
  });
}

async function sendPublicSharePayload(
  req: Request,
  res: Response,
  share: Share,
  verified: boolean
) {
  if (!share.isActive) {
    return res.status(410).json({ success: false, error: 'Share has been revoked' });
  }

  if (share.expiresAt && new Date() > share.expiresAt) {
    return res.status(410).json({ success: false, error: 'Share has expired' });
  }

  if (share.requirePasskey && !verified) {
    return res.json({
      success: true,
      share: {
        id: share.id,
        requirePasskey: true,
        customTitle: share.customTitle,
        customMessage: share.customMessage,
        expiresAt: share.expiresAt?.toISOString() ?? null,
      },
    });
  }

  const snapshot = await getLatestShareSnapshot(share.id);
  if (!snapshot) {
    return res.status(503).json({
      success: false,
      error: 'snapshot_unavailable',
      message: 'Public share snapshot is unavailable',
    });
  }

  if (snapshot.revokedAt) {
    return res.status(410).json({ success: false, error: 'Share has been revoked' });
  }

  const responseETag = `"${snapshot.payloadHash}"`;
  res.setHeader('ETag', responseETag);
  res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

  if (
    req.method === 'GET' &&
    parseETag(firstString(req.headers['if-none-match'])) === parseETag(responseETag)
  ) {
    return res.status(304).end();
  }

  void recordShareView(share.id, req).catch((error: unknown) => {
    logger.warn({ err: error, shareId: share.id }, 'Failed to record public share view');
  });

  return res.json({
    success: true,
    share: {
      id: share.id,
      requirePasskey: share.requirePasskey,
      customTitle: share.customTitle,
      customMessage: share.customMessage,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      snapshot: snapshot.payload,
    },
  });
}

/**
 * POST /api/shares - Create a share link and immutable public snapshot.
 */
managementRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireAuthenticatedUser(req, res);
    if (!userId) return;

    const body = CreateShareRequestSchema.parse(req.body);
    if (!canManageFund(req, body.fundId)) {
      return res.status(403).json({ success: false, error: 'Fund access denied' });
    }

    const idempotencyKey = firstString(req.headers['idempotency-key']) ?? body.clientRequestId;
    const idempotencyRequestHash = createShareRequestHash(body);
    if (idempotencyKey) {
      const existingShare = await findIdempotentShare(userId, idempotencyKey);
      if (existingShare) {
        return sendIdempotentShareResponse(res, existingShare, idempotencyRequestHash);
      }
    }

    const shareId = uuidv4();
    const now = new Date();
    const { share, snapshot } = await createShareWithSnapshot(
      buildShareInsertValues({
        body,
        shareId,
        userId,
        expiresAt: resolveCreateExpiresAt(body.expiresInDays),
        idempotencyKey,
        idempotencyRequestHash,
        now,
      }),
      userId
    );

    res.setHeader('ETag', versionETag(share));

    return res.status(201).json({
      success: true,
      share: serializeManagementShare(share),
      snapshot: snapshot.payload,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * GET /api/shares - List shares for a fund.
 */
managementRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireAuthenticatedUser(req, res);
    if (!userId) return;

    const fundId = firstString(req.query['fundId']);
    if (!fundId) {
      return res.status(400).json({ success: false, error: 'fundId query parameter required' });
    }
    if (!canManageFund(req, fundId)) {
      return res.status(403).json({ success: false, error: 'Fund access denied' });
    }

    const fundShares = await db
      .select()
      .from(shares)
      .where(eq(shares.fundId, fundId))
      .orderBy(desc(shares.createdAt));

    return res.json({
      success: true,
      shares: fundShares.map(serializeManagementShare),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/shares/:shareId - Update share configuration.
 */
managementRouter.patch('/:shareId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireAuthenticatedUser(req, res);
    if (!userId) return;

    const shareId = firstString(req.params['shareId']);
    if (!shareId) {
      return res.status(400).json({ success: false, error: 'Share ID is required' });
    }

    const existingShare = await findShare(shareId);
    if (!existingShare) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }
    if (!canManageFund(req, existingShare.fundId)) {
      return res.status(403).json({ success: false, error: 'Fund access denied' });
    }
    if (!requireShareVersion(req, res, existingShare)) return;

    const body = UpdateShareRequestSchema.parse(req.body);
    const updates: Partial<typeof shares.$inferInsert> = {
      updatedAt: new Date(),
      version: existingShare.version + 1,
    };

    if (body.accessLevel !== undefined) updates.accessLevel = body.accessLevel;
    if (body.requirePasskey !== undefined) {
      updates.requirePasskey = body.requirePasskey;
      if (!body.requirePasskey) updates.passkeyHash = null;
    }
    if (body.passkey !== undefined) updates.passkeyHash = hashPasskey(body.passkey);
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

    const updatedShare = await db.transaction(async (tx) => {
      const [share] = await tx
        .update(shares)
        .set(updates)
        .where(and(eq(shares.id, shareId), eq(shares.version, existingShare.version)))
        .returning();

      if (!share) return undefined;

      if (share.isActive) {
        await createShareSnapshot(share, userId, tx);
      } else {
        await markShareSnapshotsRevoked(share.id, new Date(), tx);
      }

      return share;
    });

    if (!updatedShare) {
      return res.status(412).json({
        success: false,
        error: 'precondition_failed',
        message: 'Share has been modified',
      });
    }

    res.setHeader('ETag', versionETag(updatedShare));
    return res.json({
      success: true,
      share: serializeManagementShare(updatedShare),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/shares/:shareId - Revoke a share.
 */
managementRouter.delete('/:shareId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireAuthenticatedUser(req, res);
    if (!userId) return;

    const shareId = firstString(req.params['shareId']);
    if (!shareId) {
      return res.status(400).json({ success: false, error: 'Share ID is required' });
    }

    const existingShare = await findShare(shareId);
    if (!existingShare) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }
    if (!canManageFund(req, existingShare.fundId)) {
      return res.status(403).json({ success: false, error: 'Fund access denied' });
    }
    if (!requireShareVersion(req, res, existingShare)) return;

    const revokedAt = new Date();
    const share = await db.transaction(async (tx) => {
      const [revokedShare] = await tx
        .update(shares)
        .set({ isActive: false, updatedAt: revokedAt, version: existingShare.version + 1 })
        .where(and(eq(shares.id, shareId), eq(shares.version, existingShare.version)))
        .returning();

      if (!revokedShare) return undefined;

      await markShareSnapshotsRevoked(shareId, revokedAt, tx);
      return revokedShare;
    });

    if (!share) {
      return res.status(412).json({
        success: false,
        error: 'precondition_failed',
        message: 'Share has been modified',
      });
    }

    return res.json({ success: true, message: 'Share revoked successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shares/:shareId/analytics - Get share analytics.
 */
managementRouter.get(
  '/:shareId/analytics',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireAuthenticatedUser(req, res);
      if (!userId) return;

      const shareId = firstString(req.params['shareId']);
      if (!shareId) {
        return res.status(400).json({ success: false, error: 'Share ID is required' });
      }

      const share = await findShare(shareId);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Share not found' });
      }
      if (!canManageFund(req, share.fundId)) {
        return res.status(403).json({ success: false, error: 'Fund access denied' });
      }

      const analytics = await db
        .select()
        .from(shareAnalytics)
        .where(eq(shareAnalytics.shareId, shareId))
        .orderBy(desc(shareAnalytics.viewedAt))
        .limit(100);

      return res.json({
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
  }
);

/**
 * GET /api/public/shares/:shareId - Anonymous public snapshot read.
 */
publicRouter.get(
  '/:shareId',
  publicShareReadLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shareId = firstString(req.params['shareId']);
      if (!shareId) {
        return res.status(400).json({ success: false, error: 'Share ID is required' });
      }

      const share = await findShare(shareId);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Share not found' });
      }

      return sendPublicSharePayload(req, res, share, false);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/public/shares/:shareId/verify - Verify passkey and return public snapshot.
 */
publicRouter.post(
  '/:shareId/verify',
  publicShareVerifyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shareId = firstString(req.params['shareId']);
      if (!shareId) {
        return res.status(400).json({ success: false, error: 'Share ID is required' });
      }

      const { passkey } = VerifyPasskeySchema.parse(req.body);
      const share = await findShare(shareId);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Share not found' });
      }

      if (!share.passkeyHash) {
        return res.status(400).json({ success: false, error: 'Share does not require passkey' });
      }
      if (!verifyPasskey(passkey, share.passkeyHash)) {
        return res.status(401).json({ success: false, error: 'Invalid passkey' });
      }

      return sendPublicSharePayload(req, res, share, true);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ success: false, error: 'Validation error', details: error.errors });
      }
      next(error);
    }
  }
);

export const sharesRouter = managementRouter;
export const publicSharesRouter = publicRouter;
