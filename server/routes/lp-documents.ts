/**
 * LP Documents API Routes
 *
 * Sprint 3 Documents features (TC-LP-006):
 * - GET /api/lp/documents - List documents with filtering
 * - GET /api/lp/documents/:documentId - Get document details
 * - GET /api/lp/documents/:documentId/download - Generate download URL
 * - GET /api/lp/documents/search - Search documents
 *
 * Security:
 * - All routes require LP authentication via requireLPAccess middleware
 * - Sensitive documents require re-authentication
 * - Rate limiting to prevent abuse
 * - Audit logging for SOC2/GDPR compliance
 *
 * @module server/routes/lp-documents
 */

import { Router, type Request, type Response } from 'express';
import { requireLPAccess } from '../middleware/requireLPAccess';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db';
import { eq, and, desc, sql, gte, lte, lt, isNull, or } from 'drizzle-orm';
import { lpDocuments } from '@shared/schema-lp-sprint3';
import { funds } from '@shared/schema';
import { createCursor, verifyCursor } from '../lib/crypto/cursor-signing';
import { lpAuditLogger } from '../services/lp-audit-logger';
import { recordLPRequest, recordError, startTimer } from '../observability/lp-metrics';
import { firstString } from '../lib/request-values';
import {
  createLPApiErrorResponse as createErrorResponse,
  respondInvalidCursor,
} from '../lib/lp-api-helpers';
import { createRouteLogger } from '../lib/route-logger.js';
import { productionFundPredicate } from '../lib/canary-exclusion';

const routeLog = createRouteLogger('lp-documents');

const router = Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

const documentsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 downloads per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many download requests' },
});

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const DocumentListQuerySchema = z.object({
  type: z
    .enum([
      'quarterly_report',
      'annual_report',
      'k1',
      'lpa',
      'side_letter',
      'fund_overview',
      'other',
    ])
    .optional(),
  fundId: z.coerce.number().positive().optional(),
  year: z.coerce.number().min(2000).max(new Date().getFullYear()).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const DocumentCursorSchema = z.object({
  publishedAt: z.string().datetime(),
  id: z.string().uuid(),
  limit: z.number().int().min(1).max(100),
  filters: z.object({
    type: DocumentListQuerySchema.shape.type.nullable(),
    fundId: z.number().positive().nullable(),
    year: z.number().int().min(2000).max(new Date().getFullYear()).nullable(),
  }),
});

const SearchQuerySchema = z.object({
  q: z.string().min(3, 'Search query must be at least 3 characters'),
  type: z
    .enum([
      'quarterly_report',
      'annual_report',
      'k1',
      'lpa',
      'side_letter',
      'fund_overview',
      'other',
    ])
    .optional(),
  fundId: z.coerce.number().positive().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// LIST DOCUMENTS
// GET /api/lp/documents
// ============================================================================

router.get('/documents', documentsLimiter, requireLPAccess, async (req: Request, res: Response) => {
  const endTimer = startTimer();
  const endpoint = '/api/lp/documents';

  try {
    const lpId = req.lpProfile?.id;

    if (!lpId) {
      return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
    }

    // Validate query params
    const queryResult = DocumentListQuerySchema.safeParse(req.query);
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
    const filters = {
      type: query.type ?? null,
      fundId: query.fundId ?? null,
      year: query.year ?? null,
    };
    let cursor: z.infer<typeof DocumentCursorSchema> | null = null;

    // Verify cursor if provided
    if (query.cursor) {
      try {
        const cursorPayload = DocumentCursorSchema.parse(verifyCursor<unknown>(query.cursor));
        if (
          cursorPayload.limit !== query.limit ||
          JSON.stringify(cursorPayload.filters) !== JSON.stringify(filters)
        ) {
          return respondInvalidCursor({ res, endTimer, endpoint, lpId });
        }
        cursor = cursorPayload;
      } catch {
        return respondInvalidCursor({ res, endTimer, endpoint, lpId });
      }
    }

    // Build query conditions
    const conditions = [eq(lpDocuments.lpId, lpId), eq(lpDocuments.status, 'available')];

    if (query.type) {
      conditions.push(eq(lpDocuments.documentType, query.type));
    }

    if (query.fundId) {
      conditions.push(eq(lpDocuments.fundId, query.fundId));
    }

    if (query.year) {
      const yearStart = `${query.year}-01-01`;
      const yearEnd = `${query.year}-12-31`;
      conditions.push(gte(lpDocuments.documentDate, yearStart));
      conditions.push(lte(lpDocuments.documentDate, yearEnd));
    }

    if (cursor) {
      const cursorPublishedAt = new Date(cursor.publishedAt);
      conditions.push(
        or(
          lt(lpDocuments.publishedAt, cursorPublishedAt),
          and(eq(lpDocuments.publishedAt, cursorPublishedAt), lt(lpDocuments.id, cursor.id))
        )!
      );
    }

    // Fetch documents with pagination
    const documents = await db
      .select({
        id: lpDocuments.id,
        fundId: lpDocuments.fundId,
        documentType: lpDocuments.documentType,
        title: lpDocuments.title,
        description: lpDocuments.description,
        fileName: lpDocuments.fileName,
        fileSize: lpDocuments.fileSize,
        mimeType: lpDocuments.mimeType,
        documentDate: lpDocuments.documentDate,
        publishedAt: lpDocuments.publishedAt,
        accessLevel: lpDocuments.accessLevel,
        fundName: funds.name,
      })
      .from(lpDocuments)
      .leftJoin(funds, eq(lpDocuments.fundId, funds.id))
      .where(and(...conditions, or(isNull(funds.id), productionFundPredicate(funds.dataOrigin))))
      .orderBy(desc(lpDocuments.publishedAt), desc(lpDocuments.id))
      .limit(query.limit + 1);

    // Check if there are more results
    const hasMore = documents.length > query.limit;
    const paginatedDocuments = hasMore ? documents.slice(0, query.limit) : documents;

    // Format response
    const responseDocuments = paginatedDocuments.map((d) => ({
      id: d.id,
      fundId: d.fundId,
      fundName: d.fundName ?? 'Unknown Fund',
      documentType: d.documentType,
      title: d.title,
      description: d.description,
      fileName: d.fileName,
      fileSize: d.fileSize,
      fileSizeFormatted: formatFileSize(d.fileSize),
      mimeType: d.mimeType,
      documentDate: d.documentDate,
      publishedAt: d.publishedAt.toISOString(),
      accessLevel: d.accessLevel,
    }));

    // Create next cursor if more results
    const lastDocument = paginatedDocuments.at(-1);
    const nextCursor =
      hasMore && lastDocument
        ? createCursor({
            publishedAt: lastDocument.publishedAt.toISOString(),
            id: lastDocument.id,
            limit: query.limit,
            filters,
          })
        : null;

    // Audit log
    await lpAuditLogger.logDocumentsListView(lpId, undefined, req);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, max-age=60');

    const duration = endTimer();
    recordLPRequest(endpoint, 'GET', 200, duration, lpId);

    return res.json({
      documents: responseDocuments,
      nextCursor,
      hasMore,
      totalCount: paginatedDocuments.length,
    });
  } catch (error) {
    const duration = endTimer();
    recordLPRequest(endpoint, 'GET', 500, duration);
    recordError(endpoint, 'INTERNAL_ERROR', 500);

    routeLog.error('[LP Documents API] Error:', error);
    return res
      .status(500)
      .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
  }
});

// ============================================================================
// SEARCH DOCUMENTS
// GET /api/lp/documents/search
// ============================================================================

router.get(
  '/documents/search',
  documentsLimiter,
  requireLPAccess,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/documents/search';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Validate query params
      const queryResult = SearchQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 400, duration, lpId);
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              queryResult.error.errors[0]?.message ?? 'Invalid query parameters',
              'q'
            )
          );
      }

      const query = queryResult.data;
      const searchPattern = `%${query.q}%`;

      // Build query conditions
      const conditions = [
        eq(lpDocuments.lpId, lpId),
        eq(lpDocuments.status, 'available'),
        sql`(${lpDocuments.title} ILIKE ${searchPattern} OR ${lpDocuments.description} ILIKE ${searchPattern})`,
      ];

      if (query.type) {
        conditions.push(eq(lpDocuments.documentType, query.type));
      }

      if (query.fundId) {
        conditions.push(eq(lpDocuments.fundId, query.fundId));
      }

      // Search documents
      const documents = await db
        .select({
          id: lpDocuments.id,
          fundId: lpDocuments.fundId,
          documentType: lpDocuments.documentType,
          title: lpDocuments.title,
          description: lpDocuments.description,
          fileName: lpDocuments.fileName,
          fileSize: lpDocuments.fileSize,
          publishedAt: lpDocuments.publishedAt,
          accessLevel: lpDocuments.accessLevel,
          fundName: funds.name,
        })
        .from(lpDocuments)
        .leftJoin(funds, eq(lpDocuments.fundId, funds.id))
        .where(and(...conditions, or(isNull(funds.id), productionFundPredicate(funds.dataOrigin))))
        .orderBy(desc(lpDocuments.publishedAt))
        .limit(query.limit);

      // Format response
      const responseDocuments = documents.map((d) => ({
        id: d.id,
        fundId: d.fundId,
        fundName: d.fundName ?? 'Unknown Fund',
        documentType: d.documentType,
        title: d.title,
        description: d.description,
        fileName: d.fileName,
        fileSize: d.fileSize,
        fileSizeFormatted: formatFileSize(d.fileSize),
        publishedAt: d.publishedAt.toISOString(),
        accessLevel: d.accessLevel,
      }));

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json({
        documents: responseDocuments,
        totalCount: documents.length,
        query: query.q,
      });
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      routeLog.error('[LP Documents Search API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

// ============================================================================
// GET DOCUMENT DETAILS
// GET /api/lp/documents/:documentId
// ============================================================================

router.get(
  '/documents/:documentId',
  documentsLimiter,
  requireLPAccess,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/documents/:documentId';

    try {
      const lpId = req.lpProfile?.id;
      const documentId = firstString(req.params['documentId']);

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      if (!documentId) {
        return res
          .status(400)
          .json(createErrorResponse('INVALID_REQUEST', 'Document ID is required'));
      }

      // Fetch document with fund name
      const documents = await db
        .select({
          id: lpDocuments.id,
          lpId: lpDocuments.lpId,
          fundId: lpDocuments.fundId,
          documentType: lpDocuments.documentType,
          title: lpDocuments.title,
          description: lpDocuments.description,
          fileName: lpDocuments.fileName,
          fileSize: lpDocuments.fileSize,
          mimeType: lpDocuments.mimeType,
          documentDate: lpDocuments.documentDate,
          publishedAt: lpDocuments.publishedAt,
          accessLevel: lpDocuments.accessLevel,
          status: lpDocuments.status,
          fundName: funds.name,
        })
        .from(lpDocuments)
        .leftJoin(funds, eq(lpDocuments.fundId, funds.id))
        .where(
          and(
            eq(lpDocuments.id, documentId),
            or(isNull(funds.id), productionFundPredicate(funds.dataOrigin))
          )
        )
        .limit(1);

      if (documents.length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration, lpId);
        return res
          .status(404)
          .json(createErrorResponse('DOCUMENT_NOT_FOUND', 'Document not found'));
      }

      const document = documents[0];
      if (!document) {
        return res
          .status(404)
          .json(createErrorResponse('DOCUMENT_NOT_FOUND', 'Document not found'));
      }

      // Verify LP owns this document
      if (document.lpId !== lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 403, duration, lpId);
        return res
          .status(403)
          .json(createErrorResponse('FORBIDDEN', 'You do not have access to this document'));
      }

      // Audit log
      await lpAuditLogger.logDocumentView(lpId, documentId, undefined, req);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json({
        id: document.id,
        fundId: document.fundId,
        fundName: document.fundName ?? 'Unknown Fund',
        documentType: document.documentType,
        title: document.title,
        description: document.description,
        fileName: document.fileName,
        fileSize: document.fileSize,
        fileSizeFormatted: formatFileSize(document.fileSize),
        mimeType: document.mimeType,
        documentDate: document.documentDate,
        publishedAt: document.publishedAt.toISOString(),
        accessLevel: document.accessLevel,
        status: document.status,
      });
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      routeLog.error('[LP Documents API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

// ============================================================================
// DOWNLOAD DOCUMENT
// GET /api/lp/documents/:documentId/download
// ============================================================================

router.get(
  '/documents/:documentId/download',
  downloadLimiter,
  requireLPAccess,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/documents/:documentId/download';

    try {
      const lpId = req.lpProfile?.id;
      const documentId = firstString(req.params['documentId']);

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      if (!documentId) {
        return res
          .status(400)
          .json(createErrorResponse('INVALID_REQUEST', 'Document ID is required'));
      }

      // Fetch document
      const documents = await db
        .select({
          lpId: lpDocuments.lpId,
          status: lpDocuments.status,
        })
        .from(lpDocuments)
        .leftJoin(funds, eq(lpDocuments.fundId, funds.id))
        .where(
          and(
            eq(lpDocuments.id, documentId),
            or(isNull(funds.id), productionFundPredicate(funds.dataOrigin))
          )
        )
        .limit(1);

      if (documents.length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration, lpId);
        return res
          .status(404)
          .json(createErrorResponse('DOCUMENT_NOT_FOUND', 'Document not found'));
      }

      const document = documents[0];
      if (!document) {
        return res
          .status(404)
          .json(createErrorResponse('DOCUMENT_NOT_FOUND', 'Document not found'));
      }

      // Verify LP owns this document
      if (document.lpId !== lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 403, duration, lpId);
        return res
          .status(403)
          .json(createErrorResponse('FORBIDDEN', 'You do not have access to this document'));
      }

      // Check if document is archived
      if (document.status === 'archived') {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 410, duration, lpId);
        return res
          .status(410)
          .json(
            createErrorResponse(
              'DOCUMENT_ARCHIVED',
              'This document has been archived and is no longer available for download'
            )
          );
      }

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 503, duration, lpId);
      recordError(endpoint, 'DOCUMENT_DOWNLOAD_UNAVAILABLE', 503);
      return res
        .status(503)
        .json(
          createErrorResponse('DOCUMENT_DOWNLOAD_UNAVAILABLE', 'Document downloads are unavailable')
        );
    } catch (error) {
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);

      routeLog.error('[LP Documents Download API] Error:', error);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
  }
);

export default router;
