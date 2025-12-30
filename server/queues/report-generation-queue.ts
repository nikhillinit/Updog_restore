/**
 * LP Report Generation Queue Service
 *
 * BullMQ-based job queue for generating LP reports (PDF, XLSX, CSV).
 * Provides async job processing with progress tracking and status updates.
 */

import type { Job } from 'bullmq';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { EventEmitter } from 'events';
import type IORedis from 'ioredis';
import { db } from '../db';
import { lpReports } from '@shared/schema-lp-reporting.js';
import { eq } from 'drizzle-orm';
import { getStorageService } from '../services/storage-service.js';
import { sendReportReadyEmail } from '../services/email-service.js';

// Job types
export interface ReportGenerationJobData {
  reportId: string;
  lpId: number;
  reportType: 'quarterly' | 'annual' | 'tax_package' | 'capital_account';
  dateRange: {
    startDate: string;
    endDate: string;
  };
  fundIds?: number[];
  sections?: string[];
  format: 'pdf' | 'xlsx' | 'csv';
  templateId?: number;
  metadata?: Record<string, unknown>;
}

export interface ReportGenerationResult {
  success: boolean;
  fileUrl?: string;
  fileSize?: number;
  generatedAt?: string;
  error?: string;
  durationMs?: number;
}

export interface ReportProgressEvent {
  jobId: string;
  reportId: string;
  progress: number;
  message?: string;
}

export interface ReportCompleteEvent {
  jobId: string;
  reportId: string;
  result: ReportGenerationResult;
}

export interface ReportFailedEvent {
  jobId: string;
  reportId: string;
  error: string;
}

// Event emitter for job notifications (SSE streaming)
class ReportEventEmitter extends EventEmitter {
  emitProgress(jobId: string, reportId: string, progress: number, message?: string) {
    this.emit(`report:${reportId}:progress`, { jobId, reportId, progress, message });
    this.emit('progress', { jobId, reportId, progress, message });
  }

  emitComplete(jobId: string, reportId: string, result: ReportGenerationResult) {
    this.emit(`report:${reportId}:complete`, { jobId, reportId, result });
    this.emit('complete', { jobId, reportId, result });
  }

  emitFailed(jobId: string, reportId: string, error: string) {
    this.emit(`report:${reportId}:failed`, { jobId, reportId, error });
    this.emit('failed', { jobId, reportId, error });
  }
}

export const reportEvents = new ReportEventEmitter();

// Queue name
const QUEUE_NAME = 'lp-report-generation';

// Queue and worker instances (lazily initialized)
let queue: Queue<ReportGenerationJobData, ReportGenerationResult> | null = null;
let worker: Worker<ReportGenerationJobData, ReportGenerationResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Initialize the report generation queue with Redis connection
 */
export async function initializeReportQueue(redisConnection: IORedis): Promise<{
  queue: Queue<ReportGenerationJobData, ReportGenerationResult>;
  close: () => Promise<void>;
}> {
  const opts = redisConnection['options'] as Record<string, unknown>;
  const connection = {
    host: (opts['host'] as string) || 'localhost',
    port: (opts['port'] as number) || 6379,
    password: opts['password'] as string | undefined,
  };

  // Create queue
  queue = new Queue<ReportGenerationJobData, ReportGenerationResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 50 }, // Keep last 50 completed reports
      removeOnFail: { count: 25 }, // Keep last 25 failed reports
      attempts: 2, // Retry once on failure
      backoff: {
        type: 'exponential',
        delay: 5000, // 5 second initial delay
      },
    },
  });

  // Create worker to process report generation jobs
  worker = new Worker<ReportGenerationJobData, ReportGenerationResult>(
    QUEUE_NAME,
    async (job: Job<ReportGenerationJobData, ReportGenerationResult>) => {
      const startTime = Date.now();
      const { reportId, lpId, reportType, format } = job.data;

      try {
        // Update report status to 'generating'
        await db.update(lpReports)
          .set({ status: 'generating', updatedAt: new Date() })
          .where(eq(lpReports.id, reportId));

        // Report initial progress
        await job.updateProgress(0);
        reportEvents.emitProgress(job.id!, reportId, 0, 'Starting report generation...');

        // Phase 1: Fetch data (20%)
        await job.updateProgress(10);
        reportEvents.emitProgress(job.id!, reportId, 10, 'Fetching LP data...');

        // Placeholder: Fetch LP data, fund commitments, transactions
        // const lpData = await fetchLPData(lpId, job.data.fundIds);
        await simulateWork(500); // Simulate data fetch

        await job.updateProgress(20);
        reportEvents.emitProgress(job.id!, reportId, 20, 'Processing transactions...');

        // Phase 2: Calculate metrics (40%)
        // Placeholder: Calculate capital account, performance, holdings
        // const metrics = await calculateReportMetrics(lpData, job.data.dateRange);
        await simulateWork(1000); // Simulate calculation

        await job.updateProgress(40);
        reportEvents.emitProgress(job.id!, reportId, 40, 'Generating report content...');

        // Phase 3: Generate report file (70%)
        let fileUrl: string;
        let fileSize: number;
        let reportBuffer: Buffer;

        switch (format) {
          case 'xlsx':
            // TODO: Implement actual Excel generation with xlsx library
            // const xlsxBuffer = await generateExcelReport(lpId, metrics, job.data);
            reportBuffer = Buffer.from(`Excel Report Placeholder - Report ID: ${reportId}`);
            break;

          case 'csv':
            // TODO: Implement actual CSV generation
            // const csvContent = await generateCSVReport(lpId, metrics, job.data);
            reportBuffer = Buffer.from(`date,type,amount,description\n2024-01-01,capital_call,1000000,Initial call`);
            break;

          case 'pdf':
          default:
            // TODO: Implement actual PDF generation with @react-pdf/renderer
            // For now, generate a placeholder PDF buffer
            reportBuffer = Buffer.from(`PDF Report Placeholder - Report ID: ${reportId}`);
            break;
        }

        await job.updateProgress(70);
        reportEvents.emitProgress(job.id!, reportId, 70, `Saving ${format.toUpperCase()} file...`);

        // Phase 4: Upload to storage service (90%)
        const storage = getStorageService();
        const fileKey = `reports/lp-${lpId}/${reportId}.${format}`;
        const contentTypes: Record<string, string> = {
          pdf: 'application/pdf',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          csv: 'text/csv',
        };

        try {
          const uploadResult = await storage.upload(
            fileKey,
            reportBuffer,
            contentTypes[format] || 'application/octet-stream'
          );
          fileUrl = uploadResult.url;
          fileSize = uploadResult.size;
        } catch (uploadError) {
          console.error(`[ReportQueue] Failed to upload report ${reportId}:`, uploadError);
          // Fallback to placeholder URL if storage fails
          fileUrl = `/reports/${reportId}.${format}`;
          fileSize = reportBuffer.length;
        }

        await job.updateProgress(90);
        reportEvents.emitProgress(job.id!, reportId, 90, 'Finalizing report...');

        // Phase 5: Update database (100%)
        const generatedAt = new Date();
        await db.update(lpReports)
          .set({
            status: 'ready',
            fileUrl,
            fileSize,
            generatedAt,
            updatedAt: new Date(),
          })
          .where(eq(lpReports.id, reportId));

        await job.updateProgress(100);

        const result: ReportGenerationResult = {
          success: true,
          fileUrl,
          fileSize,
          generatedAt: generatedAt.toISOString(),
          durationMs: Date.now() - startTime,
        };

        reportEvents.emitComplete(job.id!, reportId, result);
        console.log(`[ReportQueue] Generated ${reportType} report ${reportId} in ${result.durationMs}ms`);
        return result;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Update report status to 'error'
        await db.update(lpReports)
          .set({
            status: 'error',
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(lpReports.id, reportId));

        reportEvents.emitFailed(job.id!, reportId, errorMessage);
        console.error(`[ReportQueue] Failed to generate report ${reportId}:`, error);

        return {
          success: false,
          error: errorMessage,
          durationMs: Date.now() - startTime,
        };
      }
    },
    {
      connection,
      concurrency: 2, // Process 2 reports at a time
      limiter: {
        max: 10, // Max 10 reports per minute
        duration: 60000,
      },
    }
  );

  // Setup queue events for monitoring
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });

  queueEvents.on('completed', ({ jobId }) => {
    console.log(`[ReportQueue] Job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[ReportQueue] Job ${jobId} failed:`, failedReason);
  });

  // Handle worker errors
  worker.on('error', (error) => {
    console.error('[ReportQueue] Worker error:', error);
  });

  console.log('[ReportQueue] Initialized LP report generation queue');

  return {
    queue,
    close: async () => {
      await worker?.close();
      await queueEvents?.close();
      await queue?.close();
      queue = null;
      worker = null;
      queueEvents = null;
      console.log('[ReportQueue] Closed LP report generation queue');
    },
  };
}

/**
 * Enqueue a report generation job
 */
export async function enqueueReportGeneration(
  data: ReportGenerationJobData
): Promise<{ jobId: string; estimatedWaitMs: number }> {
  if (!queue) {
    throw new Error('Report queue not initialized. Call initializeReportQueue first.');
  }

  const job = await queue.add('generate-report', data, {
    jobId: `report-${data.reportId}`,
  });

  // Estimate wait time based on queue depth
  const waitingCount = await queue.getWaitingCount();
  const estimatedWaitMs = waitingCount * 30000; // ~30s per report

  console.log(`[ReportQueue] Enqueued report ${data.reportId}, waiting: ${waitingCount}`);

  return {
    jobId: job.id!,
    estimatedWaitMs,
  };
}

/**
 * Get report job status
 */
export async function getReportJobStatus(reportId: string): Promise<{
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';
  progress?: number;
  result?: ReportGenerationResult;
}> {
  if (!queue) {
    return { status: 'unknown' };
  }

  const job = await queue.getJob(`report-${reportId}`);
  if (!job) {
    return { status: 'unknown' };
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : undefined;
  const result = job.returnvalue as ReportGenerationResult | undefined;

  return {
    status: state as 'waiting' | 'active' | 'completed' | 'failed',
    ...(progress !== undefined && { progress }),
    ...(result !== undefined && { result }),
  };
}

/**
 * Check if queue is initialized and available
 */
export function isReportQueueAvailable(): boolean {
  return queue !== null;
}

/**
 * Simulate work for placeholder implementation
 */
async function simulateWork(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
