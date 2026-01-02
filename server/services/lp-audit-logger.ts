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
  | 'update_settings'
  // Sprint 3: Capital Calls
  | 'view_capital_calls_list'
  | 'view_capital_call_detail'
  | 'view_wire_instructions'
  | 'submit_payment'
  // Sprint 3: Distributions
  | 'view_distributions_list'
  | 'view_distribution_detail'
  // Sprint 3: Documents
  | 'view_documents_list'
  | 'view_document'
  | 'download_document'
  // Sprint 3: Notifications
  | 'view_notifications'
  | 'mark_notification_read'
  | 'update_notification_prefs';

export type ResourceType =
  | 'lp_profile'
  | 'lp_summary'
  | 'capital_account'
  | 'fund_detail'
  | 'holdings'
  | 'performance'
  | 'benchmark'
  | 'report'
  | 'settings'
  // Sprint 3: New resource types
  | 'capital_call'
  | 'wire_instructions'
  | 'payment_submission'
  | 'distribution'
  | 'document'
  | 'notification'
  | 'notification_preferences';

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
  async logProfileView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
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
  async logSummaryView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
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
  async logBenchmarkView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
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
  async logReportListView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
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

  // ===========================================================================
  // Sprint 3: Capital Calls Audit Methods
  // ===========================================================================

  /**
   * Log capital calls list view
   */
  async logCapitalCallsListView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_capital_calls_list',
        resourceType: 'capital_call',
      },
      req
    );
  }

  /**
   * Log capital call detail view
   */
  async logCapitalCallDetailView(
    lpId: number,
    callId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_capital_call_detail',
        resourceType: 'capital_call',
        resourceId: callId,
      },
      req
    );
  }

  /**
   * Log wire instructions access - CRITICAL for SOC2/audit compliance
   */
  async logWireInstructionsAccess(
    lpId: number,
    callId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_wire_instructions',
        resourceType: 'wire_instructions',
        resourceId: callId,
        metadata: { sensitiveDataAccessed: true },
      },
      req
    );
  }

  /**
   * Log payment submission
   */
  async logPaymentSubmission(
    lpId: number,
    callId: string,
    submissionId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'submit_payment',
        resourceType: 'payment_submission',
        resourceId: submissionId,
        metadata: { callId },
      },
      req
    );
  }

  // ===========================================================================
  // Sprint 3: Distributions Audit Methods
  // ===========================================================================

  /**
   * Log distributions list view
   */
  async logDistributionsListView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_distributions_list',
        resourceType: 'distribution',
      },
      req
    );
  }

  /**
   * Log distribution detail view
   */
  async logDistributionDetailView(
    lpId: number,
    distributionId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_distribution_detail',
        resourceType: 'distribution',
        resourceId: distributionId,
      },
      req
    );
  }

  // ===========================================================================
  // Sprint 3: Documents Audit Methods
  // ===========================================================================

  /**
   * Log documents list view
   */
  async logDocumentsListView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_documents_list',
        resourceType: 'document',
      },
      req
    );
  }

  /**
   * Log document view
   */
  async logDocumentView(
    lpId: number,
    documentId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_document',
        resourceType: 'document',
        resourceId: documentId,
      },
      req
    );
  }

  /**
   * Log document download
   */
  async logDocumentDownload(
    lpId: number,
    documentId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'download_document',
        resourceType: 'document',
        resourceId: documentId,
      },
      req
    );
  }

  // ===========================================================================
  // Sprint 3: Notifications Audit Methods
  // ===========================================================================

  /**
   * Log notifications view
   */
  async logNotificationsView(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'view_notifications',
        resourceType: 'notification',
      },
      req
    );
  }

  /**
   * Log notification marked as read
   */
  async logNotificationRead(
    lpId: number,
    notificationId: string,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'mark_notification_read',
        resourceType: 'notification',
        resourceId: notificationId,
      },
      req
    );
  }

  /**
   * Log notification preferences update
   */
  async logNotificationPrefsUpdate(
    lpId: number,
    userId: string | number | undefined,
    req?: Request
  ): Promise<void> {
    await this.log(
      {
        lpId,
        ...(userId !== undefined ? { userId } : {}),
        action: 'update_notification_prefs',
        resourceType: 'notification_preferences',
        resourceId: lpId.toString(),
      },
      req
    );
  }
}

// Export singleton instance
export const lpAuditLogger = new LPAuditLogger();
