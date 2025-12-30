/**
 * LP Audit Logger Service
 *
 * Provides structured audit logging for all LP data access and modifications.
 * Ensures compliance with SOC2, GDPR, and regulatory requirements by creating
 * an immutable audit trail of all LP reporting activities.
 *
 * Key features:
 * - Append-only logging (no deletions or modifications)
 * - Structured event types for all LP operations
 * - Captures user identity, IP address, and request metadata
 * - 7-year retention for compliance
 *
 * @module server/services/lp-audit-logger
 */

import { db } from '../db';
import { lpAuditLog } from '@shared/schema-lp-reporting';
import type { Request } from 'express';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AuditAction =
  | 'view_profile'
  | 'view_summary'
  | 'view_capital_account'
  | 'view_fund_detail'
  | 'view_holdings'
  | 'view_performance'
  | 'view_performance_benchmark'
  | 'generate_report'
  | 'view_report_list'
  | 'view_report_status'
  | 'download_report'
  | 'update_settings';

export type ResourceType =
  | 'lp_profile'
  | 'lp_summary'
  | 'capital_account'
  | 'fund_detail'
  | 'holdings'
  | 'performance'
  | 'benchmark'
  | 'report'
  | 'settings';

export interface AuditLogEntry {
  lpId: number;
  userId?: string | number; // String from JWT, converted to number for DB
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// LP AUDIT LOGGER CLASS
// ============================================================================

export class LPAuditLogger {
  /**
   * Log LP data access or modification event
   *
   * Creates an immutable audit record with full context for compliance.
   * All fields are captured from the Express request object.
   *
   * @param entry - Structured audit log entry
   * @param req - Express request object (for IP, user-agent)
   * @returns Promise<void>
   */
  async log(entry: AuditLogEntry, req?: Request): Promise<void> {
    try {
      // Extract IP address from request
      let ipAddress = entry.ipAddress;
      if (!ipAddress && req) {
        // Check X-Forwarded-For header (proxy/load balancer)
        const forwardedFor = req.headers['x-forwarded-for'];
        if (typeof forwardedFor === 'string') {
          ipAddress = forwardedFor.split(',')[0]?.trim();
        } else if (Array.isArray(forwardedFor)) {
          ipAddress = forwardedFor[0];
        }

        // Fallback to direct connection
        if (!ipAddress) {
          ipAddress = req.socket.remoteAddress || req.ip;
        }
      }

      // Extract user agent from request
      let userAgent = entry.userAgent;
      if (!userAgent && req) {
        userAgent = req.headers['user-agent'];
      }

      // Convert userId to number for DB (null if not numeric)
      let userIdNum: number | null = null;
      if (entry.userId !== undefined) {
        if (typeof entry.userId === 'number') {
          userIdNum = entry.userId;
        } else {
          const parsed = parseInt(entry.userId, 10);
          if (!Number.isNaN(parsed)) {
            userIdNum = parsed;
          }
        }
      }

      // Insert audit record (append-only, never update)
      await db.insert(lpAuditLog).values({
        lpId: entry.lpId,
        userId: userIdNum,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        metadata: entry.metadata || null,
      });
    } catch (error) {
      // CRITICAL: Audit logging failure should not block user requests
      // Log to console for monitoring/alerting but continue
      console.error('LP audit logging failed:', {
        error,
        lpId: entry.lpId,
        action: entry.action,
        resourceType: entry.resourceType,
      });

      // In production, send to error monitoring (Sentry, Datadog, etc.)
      // DO NOT throw error - user experience takes precedence
    }
  }

  /**
   * Log LP profile view
   */
  async logProfileView(lpId: number, userId: string | number | undefined, req?: Request): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_profile',
        resourceType: 'lp_profile',
        resourceId: lpId.toString(),
      },
      req
    );
  }

  /**
   * Log LP summary view
   */
  async logSummaryView(lpId: number, userId: string | number | undefined, req?: Request): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_summary',
        resourceType: 'lp_summary',
        resourceId: lpId.toString(),
      },
      req
    );
  }

  /**
   * Log capital account view
   */
  async logCapitalAccountView(
    lpId: number,
    userId: string | number | undefined,
    fundIds: number[] | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_capital_account',
        resourceType: 'capital_account',
        ...(fundIds ? { metadata: { fundIds } } : {}),
      },
      req
    );
  }

  /**
   * Log fund detail view
   */
  async logFundDetailView(
    lpId: number,
    fundId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_fund_detail',
        resourceType: 'fund_detail',
        resourceId: fundId.toString(),
        metadata: { fundId },
      },
      req
    );
  }

  /**
   * Log holdings view
   */
  async logHoldingsView(
    lpId: number,
    fundId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_holdings',
        resourceType: 'holdings',
        resourceId: fundId.toString(),
        metadata: { fundId },
      },
      req
    );
  }

  /**
   * Log performance view
   */
  async logPerformanceView(
    lpId: number,
    userId: string | number | undefined,
    fundId: number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_performance',
        resourceType: 'performance',
        ...(fundId ? { metadata: { fundId } } : {}),
      },
      req
    );
  }

  /**
   * Log benchmark view
   */
  async logBenchmarkView(lpId: number, userId: string | number | undefined, req?: Request): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_performance_benchmark',
        resourceType: 'benchmark',
      },
      req
    );
  }

  /**
   * Log report generation request
   */
  async logReportGeneration(
    lpId: number,
    reportId: string,
    reportType: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'generate_report',
        resourceType: 'report',
        resourceId: reportId,
        metadata: { reportType },
      },
      req
    );
  }

  /**
   * Log report list view
   */
  async logReportListView(lpId: number, userId: string | number | undefined, req?: Request): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_report_list',
        resourceType: 'report',
      },
      req
    );
  }

  /**
   * Log report status check
   */
  async logReportStatusView(
    lpId: number,
    reportId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_report_status',
        resourceType: 'report',
        resourceId: reportId,
      },
      req
    );
  }

  /**
   * Log report download
   */
  async logReportDownload(
    lpId: number,
    reportId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'download_report',
        resourceType: 'report',
        resourceId: reportId,
      },
      req
    );
  }

  /**
   * Log settings update
   */
  async logSettingsUpdate(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'update_settings',
        resourceType: 'settings',
        resourceId: lpId.toString(),
      },
      req
    );
  }
}

// Export singleton instance
export const lpAuditLogger = new LPAuditLogger();
