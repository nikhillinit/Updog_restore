/**
 * LP Notification Service
 *
 * Orchestrates sending notifications to LPs for various events:
 * - Capital calls
 * - Distributions
 * - Report ready
 * - Quarterly/Annual report delivery
 *
 * @module server/services/lp-notification-service
 */

import { db } from '../db';
import { limitedPartners, lpFundCommitments, lpReports } from '@shared/schema-lp-reporting';
import { eq } from 'drizzle-orm';
import {
  sendCapitalCallEmail,
  sendDistributionEmail,
  sendReportReadyEmail,
  type CapitalCallEmailData,
  type DistributionEmailData,
  type ReportReadyEmailData,
} from './email-service';
import { getStorageService } from './storage-service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
  lpId: number;
  type: 'capital_call' | 'distribution' | 'report_ready';
  timestamp: Date;
}

export interface CapitalCallNotification {
  lpId: number;
  fundId: number;
  fundName: string;
  callAmount: number;
  callDate: Date;
  dueDate: Date;
  purpose: string;
  wireInstructions: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    routingNumber: string;
    reference: string;
  };
}

export interface DistributionNotification {
  lpId: number;
  fundId: number;
  fundName: string;
  distributionAmount: number;
  distributionDate: Date;
  distributionType: 'return_of_capital' | 'income' | 'capital_gains';
  breakdown?: {
    returnOfCapital?: number;
    income?: number;
    capitalGains?: number;
  };
}

export interface ReportReadyNotification {
  lpId: number;
  reportId: string;
  reportType: string;
  reportPeriod: string;
}

// ============================================================================
// LP NOTIFICATION SERVICE
// ============================================================================

export class LPNotificationService {
  /**
   * Send capital call notification to LP
   */
  async sendCapitalCallNotification(
    notification: CapitalCallNotification
  ): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      // Fetch LP profile
      const [lp] = await db
        .select({ name: limitedPartners.name, email: limitedPartners.email })
        .from(limitedPartners)
        .where(eq(limitedPartners.id, notification.lpId))
        .limit(1);

      if (!lp || !lp.email) {
        return {
          success: false,
          error: 'LP not found or no email configured',
          lpId: notification.lpId,
          type: 'capital_call',
          timestamp,
        };
      }

      const emailData: CapitalCallEmailData = {
        lpName: lp.name,
        fundName: notification.fundName,
        callAmount: notification.callAmount,
        callDate: notification.callDate,
        dueDate: notification.dueDate,
        purpose: notification.purpose,
        wireInstructions: notification.wireInstructions,
      };

      const result = await sendCapitalCallEmail({ email: lp.email, name: lp.name }, emailData);

      return {
        success: result.success,
        ...(result.messageId ? { notificationId: result.messageId } : {}),
        ...(result.error ? { error: result.error } : {}),
        lpId: notification.lpId,
        type: 'capital_call',
        timestamp,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lpId: notification.lpId,
        type: 'capital_call',
        timestamp,
      };
    }
  }

  /**
   * Send distribution notification to LP
   */
  async sendDistributionNotification(
    notification: DistributionNotification
  ): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      // Fetch LP profile
      const [lp] = await db
        .select({ name: limitedPartners.name, email: limitedPartners.email })
        .from(limitedPartners)
        .where(eq(limitedPartners.id, notification.lpId))
        .limit(1);

      if (!lp || !lp.email) {
        return {
          success: false,
          error: 'LP not found or no email configured',
          lpId: notification.lpId,
          type: 'distribution',
          timestamp,
        };
      }

      const emailData: DistributionEmailData = {
        lpName: lp.name,
        fundName: notification.fundName,
        distributionAmount: notification.distributionAmount,
        distributionDate: notification.distributionDate,
        distributionType: notification.distributionType,
        ...(notification.breakdown ? { breakdown: notification.breakdown } : {}),
      };

      const result = await sendDistributionEmail({ email: lp.email, name: lp.name }, emailData);

      return {
        success: result.success,
        ...(result.messageId ? { notificationId: result.messageId } : {}),
        ...(result.error ? { error: result.error } : {}),
        lpId: notification.lpId,
        type: 'distribution',
        timestamp,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lpId: notification.lpId,
        type: 'distribution',
        timestamp,
      };
    }
  }

  /**
   * Send report ready notification to LP
   */
  async sendReportReadyNotification(
    notification: ReportReadyNotification
  ): Promise<NotificationResult> {
    const timestamp = new Date();

    try {
      // Fetch LP profile
      const [lp] = await db
        .select({ name: limitedPartners.name, email: limitedPartners.email })
        .from(limitedPartners)
        .where(eq(limitedPartners.id, notification.lpId))
        .limit(1);

      if (!lp || !lp.email) {
        return {
          success: false,
          error: 'LP not found or no email configured',
          lpId: notification.lpId,
          type: 'report_ready',
          timestamp,
        };
      }

      // Fetch report to get file URL
      const [report] = await db
        .select({ fileUrl: lpReports.fileUrl })
        .from(lpReports)
        .where(eq(lpReports.id, notification.reportId))
        .limit(1);

      if (!report || !report.fileUrl) {
        return {
          success: false,
          error: 'Report not found or file not ready',
          lpId: notification.lpId,
          type: 'report_ready',
          timestamp,
        };
      }

      // Generate signed download URL (expires in 7 days)
      const storage = getStorageService();
      const expirySeconds = 7 * 24 * 60 * 60; // 7 days
      let downloadUrl: string;
      let expiresAt: Date;

      try {
        const signedUrl = await storage.getSignedUrl(report.fileUrl, expirySeconds);
        downloadUrl = signedUrl.url;
        expiresAt = signedUrl.expiresAt;
      } catch {
        // Fallback to direct URL if signing fails
        downloadUrl = report.fileUrl;
        expiresAt = new Date(Date.now() + expirySeconds * 1000);
      }

      const emailData: ReportReadyEmailData = {
        lpName: lp.name,
        reportType: notification.reportType,
        reportPeriod: notification.reportPeriod,
        downloadUrl,
        expiresAt,
      };

      const result = await sendReportReadyEmail({ email: lp.email, name: lp.name }, emailData);

      return {
        success: result.success,
        ...(result.messageId ? { notificationId: result.messageId } : {}),
        ...(result.error ? { error: result.error } : {}),
        lpId: notification.lpId,
        type: 'report_ready',
        timestamp,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lpId: notification.lpId,
        type: 'report_ready',
        timestamp,
      };
    }
  }

  /**
   * Send bulk capital call notifications to all LPs in a fund
   */
  async sendBulkCapitalCallNotifications(
    fundId: number,
    callDetails: Omit<CapitalCallNotification, 'lpId' | 'fundId'>
  ): Promise<NotificationResult[]> {
    // Fetch all LPs with commitments to this fund
    const commitments = await db
      .select({ lpId: lpFundCommitments.lpId })
      .from(lpFundCommitments)
      .where(eq(lpFundCommitments.fundId, fundId));

    const results: NotificationResult[] = [];

    for (const commitment of commitments) {
      const result = await this.sendCapitalCallNotification({
        ...callDetails,
        lpId: commitment.lpId,
        fundId,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Send bulk distribution notifications to all LPs in a fund
   */
  async sendBulkDistributionNotifications(
    fundId: number,
    distributionDetails: Omit<DistributionNotification, 'lpId' | 'fundId'>
  ): Promise<NotificationResult[]> {
    // Fetch all LPs with commitments to this fund
    const commitments = await db
      .select({ lpId: lpFundCommitments.lpId })
      .from(lpFundCommitments)
      .where(eq(lpFundCommitments.fundId, fundId));

    const results: NotificationResult[] = [];

    for (const commitment of commitments) {
      const result = await this.sendDistributionNotification({
        ...distributionDetails,
        lpId: commitment.lpId,
        fundId,
      });
      results.push(result);
    }

    return results;
  }
}

// Export singleton instance
export const lpNotificationService = new LPNotificationService();
