/**
 * LP Notifications API Routes
 *
 * Sprint 3 Notifications features (TC-LP-008):
 * - GET /api/lp/notifications - List notifications with pagination
 * - GET /api/lp/notifications/unread-count - Get unread count for badge
 * - POST /api/lp/notifications/:notificationId/read - Mark as read
 * - POST /api/lp/notifications/read-all - Mark all as read
 * - GET /api/lp/notifications/preferences - Get notification preferences
 * - PUT /api/lp/notifications/preferences - Update preferences
 *
 * Security:
 * - All routes require LP authentication via requireLPAccess middleware
 * - Rate limiting to prevent abuse
 * - Audit logging for SOC2/GDPR compliance
 *
 * @module server/routes/lp-notifications
 */

import { Router, type Request, type Response } from 'express';
import { requireLPAccess } from '../middleware/requireLPAccess';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { lpNotifications, lpNotificationPreferences } from '@shared/schema-lp-sprint3';
import { createCursor, verifyCursor } from '../lib/crypto/cursor-signing';
import { lpAuditLogger } from '../services/lp-audit-logger';
import { recordLPRequest, recordError, startTimer } from '../observability/lp-metrics';

const router = Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

const notificationsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute (higher for polling)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
});

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const NotificationListQuerySchema = z.object({
  type: z.enum(['capital_call', 'distribution', 'report_ready', 'document', 'system']).optional(),
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

const MarkAllReadBodySchema = z.object({
  type: z.enum(['capital_call', 'distribution', 'report_ready', 'document', 'system']).optional(),
});

const PreferencesUpdateSchema = z.object({
  emailCapitalCalls: z.boolean().optional(),
  emailDistributions: z.boolean().optional(),
  emailQuarterlyReports: z.boolean().optional(),
  emailAnnualReports: z.boolean().optional(),
  emailMarketUpdates: z.boolean().optional(),
  inAppCapitalCalls: z.boolean().optional(),
  inAppDistributions: z.boolean().optional(),
  inAppReports: z.boolean().optional(),
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

// ============================================================================
// LIST NOTIFICATIONS
// GET /api/lp/notifications
// ============================================================================

router.get(
  '/notifications',
  requireLPAccess,
  notificationsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/notifications';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Validate query params
      const queryResult = NotificationListQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 400, duration, lpId);
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              queryResult.error.errors[0]?.message ?? 'Invalid query parameters'
            )
          );
      }

      const query = queryResult.data;
      let startOffset = 0;

      // Verify cursor if provided
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

      const now = new Date();

      // Build query conditions
      const conditions = [
        eq(lpNotifications.lpId, lpId),
        // Exclude expired notifications
        sql`(${lpNotifications.expiresAt} IS NULL OR ${lpNotifications.expiresAt} > ${now})`,
      ];

      if (query.unreadOnly) {
        conditions.push(eq(lpNotifications.read, false));
      }

      if (query.type) {
        conditions.push(eq(lpNotifications.type, query.type));
      }

      // Fetch notifications with pagination
      const notifications = await db
        .select({
          id: lpNotifications.id,
          type: lpNotifications.type,
          title: lpNotifications.title,
          message: lpNotifications.message,
          relatedEntityType: lpNotifications.relatedEntityType,
          relatedEntityId: lpNotifications.relatedEntityId,
          actionUrl: lpNotifications.actionUrl,
          read: lpNotifications.read,
          readAt: lpNotifications.readAt,
          createdAt: lpNotifications.createdAt,
        })
        .from(lpNotifications)
        .where(and(...conditions))
        .orderBy(desc(lpNotifications.createdAt))
        .limit(query.limit + 1)
        .offset(startOffset);

      // Check if there are more results
      const hasMore = notifications.length > query.limit;
      const paginatedNotifications = hasMore ? notifications.slice(0, query.limit) : notifications;

      // Get unread count
      const unreadResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(lpNotifications)
        .where(
          and(
            eq(lpNotifications.lpId, lpId),
            eq(lpNotifications.read, false),
            sql`(${lpNotifications.expiresAt} IS NULL OR ${lpNotifications.expiresAt} > ${now})`
          )
        );

      const unreadCount = unreadResult[0]?.count ?? 0;

      // Format response
      const responseNotifications = paginatedNotifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedEntityType: n.relatedEntityType,
        relatedEntityId: n.relatedEntityId,
        actionUrl: n.actionUrl,
        read: n.read,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      }));

      // Create next cursor if more results
      const nextCursor = hasMore
        ? createCursor({ offset: startOffset + query.limit, limit: query.limit })
        : null;

      // Audit log
      await lpAuditLogger.logNotificationsView(lpId, undefined, req);

      // Set cache headers based on unreadOnly
      const cacheMaxAge = query.unreadOnly ? 10 : 60;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', `private, max-age=${cacheMaxAge}`);

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json({
        notifications: responseNotifications,
        nextCursor,
        hasMore,
        unreadCount,
      });
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      console.error('[LP Notifications API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

// ============================================================================
// GET UNREAD COUNT
// GET /api/lp/notifications/unread-count
// ============================================================================

router.get(
  '/notifications/unread-count',
  requireLPAccess,
  notificationsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/notifications/unread-count';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      const now = new Date();

      // Get unread count (optimized query)
      const result = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(lpNotifications)
        .where(
          and(
            eq(lpNotifications.lpId, lpId),
            eq(lpNotifications.read, false),
            sql`(${lpNotifications.expiresAt} IS NULL OR ${lpNotifications.expiresAt} > ${now})`
          )
        );

      const unreadCount = result[0]?.count ?? 0;

      // Short cache for badge updates
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=10');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json({
        unreadCount,
        lastUpdated: now.toISOString(),
      });
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      console.error('[LP Notifications Unread API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

// ============================================================================
// MARK NOTIFICATION AS READ
// POST /api/lp/notifications/:notificationId/read
// ============================================================================

router.post(
  '/notifications/:notificationId/read',
  requireLPAccess,
  notificationsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/notifications/:notificationId/read';

    try {
      const lpId = req.lpProfile?.id;
      const notificationId = req.params['notificationId'];

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      if (!notificationId) {
        return res
          .status(400)
          .json(createErrorResponse('INVALID_REQUEST', 'Notification ID is required'));
      }

      // Fetch notification
      const notifications = await db
        .select({
          id: lpNotifications.id,
          lpId: lpNotifications.lpId,
          read: lpNotifications.read,
          readAt: lpNotifications.readAt,
        })
        .from(lpNotifications)
        .where(eq(lpNotifications.id, notificationId))
        .limit(1);

      if (notifications.length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'POST', 404, duration, lpId);
        return res
          .status(404)
          .json(createErrorResponse('NOTIFICATION_NOT_FOUND', 'Notification not found'));
      }

      const notification = notifications[0];
      if (!notification) {
        return res
          .status(404)
          .json(createErrorResponse('NOTIFICATION_NOT_FOUND', 'Notification not found'));
      }

      // Verify LP owns this notification
      if (notification.lpId !== lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'POST', 403, duration, lpId);
        return res
          .status(403)
          .json(createErrorResponse('FORBIDDEN', 'You do not have access to this notification'));
      }

      // Mark as read (idempotent)
      const now = new Date();
      const readAt = notification.readAt ?? now;

      if (!notification.read) {
        await db
          .update(lpNotifications)
          .set({
            read: true,
            readAt: now,
          })
          .where(eq(lpNotifications.id, notificationId));
      }

      // Audit log
      await lpAuditLogger.logNotificationRead(lpId, notificationId, undefined, req);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');

      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 200, duration, lpId);

      return res.json({
        success: true,
        notification: {
          id: notificationId,
          read: true,
          readAt: readAt.toISOString(),
        },
      });
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      console.error('[LP Notifications Read API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

// ============================================================================
// MARK ALL AS READ
// POST /api/lp/notifications/read-all
// ============================================================================

router.post(
  '/notifications/read-all',
  requireLPAccess,
  notificationsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/notifications/read-all';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Validate body
      const bodyResult = MarkAllReadBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'POST', 400, duration, lpId);
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              bodyResult.error.errors[0]?.message ?? 'Invalid request body'
            )
          );
      }

      const { type } = bodyResult.data;
      const now = new Date();

      // Build update conditions
      const conditions = [eq(lpNotifications.lpId, lpId), eq(lpNotifications.read, false)];

      if (type) {
        conditions.push(eq(lpNotifications.type, type));
      }

      // Count unread before update
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(lpNotifications)
        .where(and(...conditions));

      const markedCount = countResult[0]?.count ?? 0;

      // Mark all as read
      if (markedCount > 0) {
        await db
          .update(lpNotifications)
          .set({
            read: true,
            readAt: now,
          })
          .where(and(...conditions));
      }

      // Audit log
      await lpAuditLogger.logNotificationsView(lpId, undefined, req);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');

      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 200, duration, lpId);

      const response: Record<string, unknown> = {
        success: true,
        markedCount,
      };

      if (type) {
        response['type'] = type;
      }

      return res.json(response);
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      console.error('[LP Notifications Read All API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

// ============================================================================
// GET NOTIFICATION PREFERENCES
// GET /api/lp/notifications/preferences
// ============================================================================

router.get(
  '/notifications/preferences',
  requireLPAccess,
  notificationsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/notifications/preferences';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Fetch preferences
      const preferences = await db
        .select({
          emailCapitalCalls: lpNotificationPreferences.emailCapitalCalls,
          emailDistributions: lpNotificationPreferences.emailDistributions,
          emailQuarterlyReports: lpNotificationPreferences.emailQuarterlyReports,
          emailAnnualReports: lpNotificationPreferences.emailAnnualReports,
          emailMarketUpdates: lpNotificationPreferences.emailMarketUpdates,
          inAppCapitalCalls: lpNotificationPreferences.inAppCapitalCalls,
          inAppDistributions: lpNotificationPreferences.inAppDistributions,
          inAppReports: lpNotificationPreferences.inAppReports,
        })
        .from(lpNotificationPreferences)
        .where(eq(lpNotificationPreferences.lpId, lpId))
        .limit(1);

      // Return defaults if not set
      const prefs = preferences[0] ?? {
        emailCapitalCalls: true,
        emailDistributions: true,
        emailQuarterlyReports: true,
        emailAnnualReports: true,
        emailMarketUpdates: false,
        inAppCapitalCalls: true,
        inAppDistributions: true,
        inAppReports: true,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json({
        preferences: prefs,
      });
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      console.error('[LP Notifications Preferences API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

// ============================================================================
// UPDATE NOTIFICATION PREFERENCES
// PUT /api/lp/notifications/preferences
// ============================================================================

router.put(
  '/notifications/preferences',
  requireLPAccess,
  notificationsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/notifications/preferences';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Validate request body
      const bodyResult = PreferencesUpdateSchema.safeParse(req.body);
      if (!bodyResult.success) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'PUT', 400, duration, lpId);
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              bodyResult.error.errors[0]?.message ?? 'Invalid preference values'
            )
          );
      }

      const updates = bodyResult.data;

      // Check if any updates provided
      if (Object.keys(updates).length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'PUT', 400, duration, lpId);
        return res
          .status(400)
          .json(
            createErrorResponse('VALIDATION_ERROR', 'At least one preference must be provided')
          );
      }

      const now = new Date();

      // Upsert preferences
      const existingPrefs = await db
        .select({ id: lpNotificationPreferences.id })
        .from(lpNotificationPreferences)
        .where(eq(lpNotificationPreferences.lpId, lpId))
        .limit(1);

      if (existingPrefs.length > 0) {
        // Update existing
        await db
          .update(lpNotificationPreferences)
          .set({
            ...updates,
            updatedAt: now,
          })
          .where(eq(lpNotificationPreferences.lpId, lpId));
      } else {
        // Insert with defaults
        await db.insert(lpNotificationPreferences).values({
          lpId,
          emailCapitalCalls: updates.emailCapitalCalls ?? true,
          emailDistributions: updates.emailDistributions ?? true,
          emailQuarterlyReports: updates.emailQuarterlyReports ?? true,
          emailAnnualReports: updates.emailAnnualReports ?? true,
          emailMarketUpdates: updates.emailMarketUpdates ?? false,
          inAppCapitalCalls: updates.inAppCapitalCalls ?? true,
          inAppDistributions: updates.inAppDistributions ?? true,
          inAppReports: updates.inAppReports ?? true,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Fetch updated preferences
      const preferences = await db
        .select({
          emailCapitalCalls: lpNotificationPreferences.emailCapitalCalls,
          emailDistributions: lpNotificationPreferences.emailDistributions,
          emailQuarterlyReports: lpNotificationPreferences.emailQuarterlyReports,
          emailAnnualReports: lpNotificationPreferences.emailAnnualReports,
          emailMarketUpdates: lpNotificationPreferences.emailMarketUpdates,
          inAppCapitalCalls: lpNotificationPreferences.inAppCapitalCalls,
          inAppDistributions: lpNotificationPreferences.inAppDistributions,
          inAppReports: lpNotificationPreferences.inAppReports,
        })
        .from(lpNotificationPreferences)
        .where(eq(lpNotificationPreferences.lpId, lpId))
        .limit(1);

      // Audit log
      await lpAuditLogger.logNotificationPrefsUpdate(lpId, undefined, req);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');

      const duration = endTimer();
      recordLPRequest(endpoint, 'PUT', 200, duration, lpId);

      return res.json({
        success: true,
        preferences: preferences[0],
      });
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'PUT', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      console.error('[LP Notifications Preferences Update API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

export default router;
