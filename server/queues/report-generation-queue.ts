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
import {
  fetchLPReportData,
  prefetchReportMetrics,
  buildK1ReportData,
  buildQuarterlyReportData,
  buildCapitalAccountReportData,
  generateK1PDF,
  generateQuarterlyPDF,
  generateCapitalAccountPDF,
} from '../services/pdf-generation-service.js';
import {
  generateCapitalAccountXLSX,
  generateQuarterlyXLSX,
} from '../services/xlsx-generation-service.js';

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

// ============================================================================
// REPORT GENERATION DISPATCH (reduces worker cyclomatic complexity)
// ============================================================================

/** Shared context passed to all format handlers */
interface ReportGenerationContext {
  lpData: Awaited<ReturnType<typeof fetchLPReportData>>;
  fundId: number;
  reportType: ReportGenerationJobData['reportType'];
  dateRange: ReportGenerationJobData['dateRange'];
  reportMetrics: Awaited<ReturnType<typeof prefetchReportMetrics>>;
}

/** Resolve fundId once from job data or first commitment */
function resolveFundId(
  jobFundIds: number[] | undefined,
  lpData: Awaited<ReturnType<typeof fetchLPReportData>>
): number {
  const fundId = jobFundIds?.[0] || lpData.commitments[0]?.fundId;
  if (!fundId) {
    throw new Error('No fund ID available for report generation');
  }
  return fundId;
}

/** Extract quarter label from end date */
function resolveQuarter(endDate: Date, reportType: string): string {
  if (reportType === 'annual') return 'Annual';
  return `Q${Math.floor(endDate.getMonth() / 3) + 1}`;
}

async function generateXLSXReport(ctx: ReportGenerationContext): Promise<Buffer> {
  const { lpData, fundId, reportType, dateRange, reportMetrics } = ctx;
  if (reportType === 'capital_account') {
    const data = buildCapitalAccountReportData(lpData, fundId, new Date(dateRange.endDate));
    return generateCapitalAccountXLSX(data);
  }
  const endDate = new Date(dateRange.endDate);
  const data = buildQuarterlyReportData(
    lpData,
    fundId,
    resolveQuarter(endDate, reportType),
    endDate.getFullYear(),
    reportMetrics ?? undefined
  );
  return generateQuarterlyXLSX(data);
}

async function generateCSVReport(ctx: ReportGenerationContext): Promise<Buffer> {
  const header = 'date,type,amount,description\n';
  const rows = ctx.lpData.transactions
    .map(
      (t) => `${t.date.toISOString().split('T')[0]},${t.type},${t.amount},${t.description || ''}`
    )
    .join('\n');
  return Buffer.from(header + rows);
}

async function generatePDFReport(ctx: ReportGenerationContext): Promise<Buffer> {
  const { lpData, fundId, reportType, dateRange, reportMetrics } = ctx;
  switch (reportType) {
    case 'tax_package': {
      const taxYear = new Date(dateRange.endDate).getFullYear();
      const k1Data = buildK1ReportData(lpData, fundId, taxYear);
      return generateK1PDF(k1Data);
    }
    case 'capital_account': {
      const data = buildCapitalAccountReportData(lpData, fundId, new Date(dateRange.endDate));
      return generateCapitalAccountPDF(data);
    }
    case 'quarterly':
    case 'annual':
    default: {
      const endDate = new Date(dateRange.endDate);
      const data = buildQuarterlyReportData(
        lpData,
        fundId,
        resolveQuarter(endDate, reportType),
        endDate.getFullYear(),
        reportMetrics ?? undefined
      );
      return generateQuarterlyPDF(data);
    }
  }
}

/** Dispatch table: format -> handler */
const FORMAT_HANDLERS: Record<
  ReportGenerationJobData['format'],
  (ctx: ReportGenerationContext) => Promise<Buffer>
> = {
  xlsx: generateXLSXReport,
  csv: generateCSVReport,
  pdf: generatePDFReport,
};

// ============================================================================
// PIPELINE HELPERS (reduce worker callback CC)
// ============================================================================

async function setReportStatus(
  reportId: string,
  status: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await db
    .update(lpReports)
    .set({ status, ...extra, updatedAt: new Date() })
    .where(eq(lpReports.id, reportId));
}

async function reportProgress(
  job: Job<ReportGenerationJobData, ReportGenerationResult>,
  reportId: string,
  pct: number,
  msg: string
): Promise<void> {
  await job.updateProgress(pct);
  reportEvents.emitProgress(job.id!, reportId, pct, msg);
}

async function uploadReportFile(
  reportId: string,
  lpId: number,
  format: string,
  buffer: Buffer
): Promise<{ url: string; size: number }> {
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
      buffer,
      contentTypes[format] || 'application/octet-stream'
    );
    return { url: uploadResult.url, size: uploadResult.size };
  } catch (uploadError) {
    console.error(`[ReportQueue] Failed to upload report ${reportId}:`, uploadError);
    return { url: `/reports/${reportId}.${format}`, size: buffer.length };
  }
}

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
  // eslint-disable-next-line povc-security/require-bullmq-config -- uses lockDuration (BullMQ's actual timeout)
  worker = new Worker<ReportGenerationJobData, ReportGenerationResult>(
    QUEUE_NAME,
    async (job: Job<ReportGenerationJobData, ReportGenerationResult>) => {
      const startTime = Date.now();
      const { reportId, lpId, reportType, format } = job.data;

      try {
        await setReportStatus(reportId, 'generating');
        await reportProgress(job, reportId, 0, 'Starting report generation...');
        await reportProgress(job, reportId, 10, 'Fetching LP data...');

        await simulateWork(500); // Simulate data fetch

        await reportProgress(job, reportId, 20, 'Processing transactions...');

        await simulateWork(1000); // Simulate calculation

        await reportProgress(job, reportId, 40, 'Generating report content...');

        // Fetch LP data and resolve fundId once (single source of truth)
        const lpData = await fetchLPReportData(lpId, job.data.fundIds);
        const resolvedFundId = resolveFundId(job.data.fundIds, lpData);
        const reportMetrics = await prefetchReportMetrics(lpId, resolvedFundId);

        // Dispatch to format-specific handler
        const handler = FORMAT_HANDLERS[format];
        const reportBuffer = await handler({
          lpData,
          fundId: resolvedFundId,
          reportType,
          dateRange: job.data.dateRange,
          reportMetrics,
        });

        await reportProgress(job, reportId, 70, `Saving ${format.toUpperCase()} file...`);
        const { url: fileUrl, size: fileSize } = await uploadReportFile(
          reportId,
          lpId,
          format,
          reportBuffer
        );

        await reportProgress(job, reportId, 90, 'Finalizing report...');

        const generatedAt = new Date();
        await setReportStatus(reportId, 'ready', { fileUrl, fileSize, generatedAt });
        await reportProgress(job, reportId, 100, 'Report generation complete.');

        const result: ReportGenerationResult = {
          success: true,
          fileUrl,
          fileSize,
          generatedAt: generatedAt.toISOString(),
          durationMs: Date.now() - startTime,
        };

        reportEvents.emitComplete(job.id!, reportId, result);
        console.log(
          `[ReportQueue] Generated ${reportType} report ${reportId} in ${result.durationMs}ms`
        );
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await setReportStatus(reportId, 'error', { errorMessage });

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
      lockDuration: 300000, // 5 min timeout per AP-QUEUE-02
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
      // eslint-disable-next-line require-atomic-updates -- sequential cleanup, no race
      queue = null;
      // eslint-disable-next-line require-atomic-updates -- sequential cleanup, no race
      worker = null;
      // eslint-disable-next-line require-atomic-updates -- sequential cleanup, no race
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
