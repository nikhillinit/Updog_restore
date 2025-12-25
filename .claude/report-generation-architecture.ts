/**
 * Report Generation Architecture
 *
 * Background job processing for PDF/Excel report generation using BullMQ.
 * Implements async processing, retry logic, and progress tracking.
 */

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

// Job Data Schema
const ReportJobDataSchema = z.object({
  reportId: z.string().uuid(),
  lpId: z.string().uuid(),
  type: z.enum(['quarterly', 'annual', 'custom']),
  format: z.enum(['pdf', 'excel']),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  fundIds: z.array(z.string().uuid()).optional(),
  includeHoldings: z.boolean().default(true),
  includeCapitalActivity: z.boolean().default(true),
  includePerformanceHistory: z.boolean().default(true),
});

type ReportJobData = z.infer<typeof ReportJobDataSchema>;

// Report Generation Service
export class ReportGenerationService {
  private queue: Queue<ReportJobData>;
  private worker: Worker<ReportJobData>;

  constructor(private redis: Redis) {
    // Initialize queue
    this.queue = new Queue<ReportJobData>('lp-reports', {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 25s, 125s
        },
        removeOnComplete: {
          age: 7 * 24 * 60 * 60, // Keep for 7 days
          count: 1000,
        },
        removeOnFail: {
          age: 30 * 24 * 60 * 60, // Keep failures for 30 days
        },
      },
    });

    // Initialize worker
    this.worker = new Worker<ReportJobData>(
      'lp-reports',
      this.processReport.bind(this),
      {
        connection: redis,
        concurrency: 5, // Process 5 reports concurrently
        limiter: {
          max: 10,
          duration: 60000, // Max 10 jobs per minute
        },
      }
    );

    this.setupEventHandlers();
  }

  /**
   * Queue a new report generation job
   */
  async queueReport(data: ReportJobData): Promise<string> {
    const validated = ReportJobDataSchema.parse(data);

    const job = await this.queue.add(`report-${validated.reportId}`, validated, {
      jobId: validated.reportId,
      timeout: 600000, // 10 minute timeout
    });

    return job.id!;
  }

  /**
   * Get report job status
   */
  async getReportStatus(reportId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    error?: string;
    downloadUrl?: string;
  }> {
    const job = await this.queue.getJob(reportId);

    if (!job) {
      throw new Error('Report job not found');
    }

    const state = await job.getState();
    const progress = job.progress as number;

    let status: 'pending' | 'processing' | 'completed' | 'failed';
    if (state === 'completed') status = 'completed';
    else if (state === 'failed') status = 'failed';
    else if (state === 'active') status = 'processing';
    else status = 'pending';

    const result = {
      status,
      progress: progress || 0,
    };

    if (state === 'failed') {
      return {
        ...result,
        error: job.failedReason || 'Unknown error',
      };
    }

    if (state === 'completed') {
      const downloadToken = this.generateDownloadToken(reportId);
      return {
        ...result,
        downloadUrl: `/api/lp/${job.data.lpId}/reports/${reportId}/download?token=${downloadToken}`,
      };
    }

    return result;
  }

  /**
   * Process report generation job
   */
  private async processReport(
    job: Job<ReportJobData>
  ): Promise<{ filePath: string; format: string }> {
    const { reportId, lpId, format, periodStart, periodEnd } = job.data;

    try {
      // Update progress: Fetching data
      await job.updateProgress(10);

      // Fetch all required data
      const [profile, capitalAccount, performance, holdings, activity] =
        await Promise.all([
          this.fetchLPProfile(lpId),
          this.fetchCapitalAccount(lpId, job.data.fundIds),
          this.fetchPerformanceMetrics(lpId, job.data.fundIds),
          job.data.includeHoldings
            ? this.fetchHoldings(lpId, job.data.fundIds)
            : null,
          job.data.includeCapitalActivity
            ? this.fetchCapitalActivity(lpId, job.data.fundIds, periodStart, periodEnd)
            : null,
        ]);

      await job.updateProgress(40);

      // Generate report based on format
      let filePath: string;
      if (format === 'pdf') {
        filePath = await this.generatePDFReport(reportId, {
          profile,
          capitalAccount,
          performance,
          holdings,
          activity,
          periodStart,
          periodEnd,
        });
      } else {
        filePath = await this.generateExcelReport(reportId, {
          profile,
          capitalAccount,
          performance,
          holdings,
          activity,
          periodStart,
          periodEnd,
        });
      }

      await job.updateProgress(100);

      return { filePath, format };
    } catch (error) {
      console.error('Report generation failed:', error);
      throw error; // BullMQ will handle retries
    }
  }

  /**
   * Generate PDF report
   */
  private async generatePDFReport(
    reportId: string,
    data: any
  ): Promise<string> {
    const doc = new PDFDocument({ margin: 50 });
    const filePath = `/tmp/reports/${reportId}.pdf`;

    // Pipe to file (use S3 in production)
    const stream = require('fs').createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text('Limited Partner Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`${data.profile.name}`, { align: 'center' });
    doc.fontSize(10).text(`Period: ${data.periodStart} to ${data.periodEnd}`, {
      align: 'center',
    });
    doc.moveDown(2);

    // Capital Account Summary
    doc.fontSize(16).text('Capital Account Summary');
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Total Commitment: $${data.capitalAccount.totalCommitment.toLocaleString()}`);
    doc.text(`Total Paid In: $${data.capitalAccount.totalPaidIn.toLocaleString()}`);
    doc.text(`Total Distributed: $${data.capitalAccount.totalDistributed.toLocaleString()}`);
    doc.text(`Current NAV: $${data.capitalAccount.totalNav.toLocaleString()}`);
    doc.moveDown(2);

    // Performance Metrics
    doc.fontSize(16).text('Performance Metrics');
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Net IRR: ${data.performance.netIrr.toFixed(2)}%`);
    doc.text(`MOIC: ${data.performance.moic.toFixed(2)}x`);
    doc.text(`DPI: ${data.performance.dpi.toFixed(2)}x`);
    doc.text(`TVPI: ${data.performance.tvpi.toFixed(2)}x`);
    doc.moveDown(2);

    // Holdings (if included)
    if (data.holdings) {
      doc.addPage();
      doc.fontSize(16).text('Portfolio Holdings');
      doc.moveDown();
      doc.fontSize(10);

      data.holdings.forEach((holding: any, index: number) => {
        if (index > 0 && index % 10 === 0) {
          doc.addPage();
        }
        doc.text(`${holding.companyName} - $${holding.currentValue.toLocaleString()}`);
      });
    }

    // Finalize PDF
    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  /**
   * Generate Excel report
   */
  private async generateExcelReport(
    reportId: string,
    data: any
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const filePath = `/tmp/reports/${reportId}.xlsx`;

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];

    summarySheet.addRows([
      { metric: 'LP Name', value: data.profile.name },
      { metric: 'Period Start', value: data.periodStart },
      { metric: 'Period End', value: data.periodEnd },
      { metric: '', value: '' },
      { metric: 'Total Commitment', value: data.capitalAccount.totalCommitment },
      { metric: 'Total Paid In', value: data.capitalAccount.totalPaidIn },
      { metric: 'Total Distributed', value: data.capitalAccount.totalDistributed },
      { metric: 'Current NAV', value: data.capitalAccount.totalNav },
      { metric: '', value: '' },
      { metric: 'Net IRR (%)', value: data.performance.netIrr },
      { metric: 'MOIC', value: data.performance.moic },
      { metric: 'DPI', value: data.performance.dpi },
      { metric: 'TVPI', value: data.performance.tvpi },
    ]);

    // Holdings Sheet
    if (data.holdings) {
      const holdingsSheet = workbook.addWorksheet('Holdings');
      holdingsSheet.columns = [
        { header: 'Company', key: 'company', width: 30 },
        { header: 'Fund', key: 'fund', width: 20 },
        { header: 'Cost Basis', key: 'cost', width: 15 },
        { header: 'Current Value', key: 'value', width: 15 },
        { header: 'Unrealized Multiple', key: 'multiple', width: 18 },
      ];

      holdingsSheet.addRows(
        data.holdings.map((h: any) => ({
          company: h.companyName,
          fund: h.fundName,
          cost: h.costBasis,
          value: h.currentValue,
          multiple: h.unrealizedMultiple,
        }))
      );
    }

    // Capital Activity Sheet
    if (data.activity) {
      const activitySheet = workbook.addWorksheet('Capital Activity');
      activitySheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Fund', key: 'fund', width: 20 },
        { header: 'Type', key: 'type', width: 20 },
        { header: 'Amount', key: 'amount', width: 15 },
      ];

      activitySheet.addRows(
        data.activity.map((a: any) => ({
          date: a.date,
          fund: a.fundName,
          type: a.type,
          amount: a.amount,
        }))
      );
    }

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  /**
   * Generate time-limited download token
   */
  private generateDownloadToken(reportId: string): string {
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const payload = `${reportId}:${expiry}`;
    const signature = createHash('sha256')
      .update(payload + process.env.DOWNLOAD_TOKEN_SECRET!)
      .digest('hex');

    return Buffer.from(`${payload}:${signature}`).toString('base64url');
  }

  /**
   * Verify download token
   */
  verifyDownloadToken(token: string, reportId: string): boolean {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const [id, expiry, signature] = decoded.split(':');

      if (id !== reportId) return false;
      if (Date.now() > parseInt(expiry)) return false;

      const payload = `${id}:${expiry}`;
      const expectedSignature = createHash('sha256')
        .update(payload + process.env.DOWNLOAD_TOKEN_SECRET!)
        .digest('hex');

      return signature === expectedSignature;
    } catch {
      return false;
    }
  }

  /**
   * Setup event handlers for monitoring
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`Report ${job.id} completed successfully`);
      // TODO: Send notification to LP
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Report ${job?.id} failed:`, err);
      // TODO: Send failure notification
    });

    this.worker.on('progress', (job, progress) => {
      console.log(`Report ${job.id} progress: ${progress}%`);
    });
  }

  // Data fetching methods (to be implemented)
  private async fetchLPProfile(lpId: string): Promise<any> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }

  private async fetchCapitalAccount(lpId: string, fundIds?: string[]): Promise<any> {
    // TODO: Implement database query with fund filtering
    throw new Error('Not implemented');
  }

  private async fetchPerformanceMetrics(lpId: string, fundIds?: string[]): Promise<any> {
    // TODO: Implement performance calculation service call
    throw new Error('Not implemented');
  }

  private async fetchHoldings(lpId: string, fundIds?: string[]): Promise<any> {
    // TODO: Implement holdings query with pro-rata calculation
    throw new Error('Not implemented');
  }

  private async fetchCapitalActivity(
    lpId: string,
    fundIds: string[] | undefined,
    startDate: string,
    endDate: string
  ): Promise<any> {
    // TODO: Implement capital activity query
    throw new Error('Not implemented');
  }
}
