import { Worker, type Job } from 'bullmq';
import { db } from '../server/db';
import {
  documents,
  funds,
  limitedPartners,
  fundLpCommitments,
  fundSnapshots,
} from '@shared/schema';
import { eq, and, desc, lte, gte, inArray, isNull, sql } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { singleflightEnhanced } from '../server/utils/singleflight-enhanced';
import { registerWorker, createHealthServer } from './health-server';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

interface ReportJobData {
  reportType: 'capital_account' | 'performance_letter' | 'quarterly_report';
  fundId: number;
  lpIds: string[];
  asOfDate: Date;
  preview?: boolean;
  correlationId: string;
  userId?: number;
  idempotencyKey?: string;
}

interface ReportContext {
  reportType: ReportJobData['reportType'];
  fundId: number;
  lpIds: string[];
  asOfDate: Date;
  preview: boolean;
  correlationId: string;
  idempotencyKey?: string;
}

// Simple PDF-like text generation (can be replaced with pdfkit/pdf-lib later)
const generateCapitalAccount = async (data: any) => {
  const { fund, limitedPartners, commitments, asOfDate, generatedAt } = data;

  const lines = [
    '='.repeat(80),
    'CAPITAL ACCOUNT STATEMENT',
    '='.repeat(80),
    '',
    `Fund: ${fund?.name || 'N/A'}`,
    `As of Date: ${new Date(asOfDate).toLocaleDateString()}`,
    `Generated: ${new Date(generatedAt).toLocaleString()}`,
    '',
    '-'.repeat(80),
    'LIMITED PARTNERS',
    '-'.repeat(80),
    '',
  ];

  for (const lp of limitedPartners) {
    const commitment = commitments.find((c: any) => c.lpId === lp.id);
    lines.push(`LP: ${lp.name || lp.id}`);
    lines.push(`Commitment: $${commitment?.commitment || '0'}`);
    lines.push(`Status: ${commitment?.status || 'Active'}`);
    lines.push('');
  }

  lines.push('-'.repeat(80));
  lines.push('END OF REPORT');
  lines.push('='.repeat(80));

  return Buffer.from(lines.join('\n'), 'utf-8');
};

const generatePerformanceLetter = async (data: any) => {
  const { fund, limitedPartners, historicalData, asOfDate, generatedAt } = data;

  const lines = [
    '='.repeat(80),
    'QUARTERLY PERFORMANCE LETTER',
    '='.repeat(80),
    '',
    `Dear Limited Partners,`,
    '',
    `We are pleased to present the performance update for ${fund?.name || 'the Fund'}`,
    `as of ${new Date(asOfDate).toLocaleDateString()}.`,
    '',
    '-'.repeat(80),
    'FUND OVERVIEW',
    '-'.repeat(80),
    '',
    `Fund Size: $${fund?.size || 'N/A'}`,
    `Deployed Capital: $${fund?.deployedCapital || '0'}`,
    `Management Fee: ${fund?.managementFee ? parseFloat(fund.managementFee) * 100 : 'N/A'}%`,
    `Carry: ${fund?.carryPercentage ? parseFloat(fund.carryPercentage) * 100 : 'N/A'}%`,
    `Vintage Year: ${fund?.vintageYear || 'N/A'}`,
    '',
    '-'.repeat(80),
    'PERFORMANCE HIGHLIGHTS',
    '-'.repeat(80),
    '',
    `Number of LP Distributions: ${limitedPartners.length}`,
    `Historical Snapshots: ${historicalData.length}`,
    '',
    '-'.repeat(80),
    'END OF LETTER',
    '='.repeat(80),
  ];

  return Buffer.from(lines.join('\n'), 'utf-8');
};

// Add watermark to text-based reports
const addWatermark = (
  buffer: Buffer,
  watermarkText: string = 'PREVIEW - NOT FOR DISTRIBUTION'
): Buffer => {
  const content = buffer.toString('utf-8');
  const lines = content.split('\n');

  // Insert watermark at top and throughout document
  const watermarked = [
    '='.repeat(80),
    `*** ${watermarkText} ***`.padStart(50),
    '='.repeat(80),
    '',
    ...lines,
  ];

  // Add watermark every 20 lines
  const withPeriodicWatermarks: string[] = [];
  watermarked.forEach((line, index) => {
    withPeriodicWatermarks.push(line);
    if (index > 0 && index % 20 === 0) {
      withPeriodicWatermarks.push(`[${watermarkText}]`);
    }
  });

  return Buffer.from(withPeriodicWatermarks.join('\n'), 'utf-8');
};

const toReportContext = (data: ReportJobData): ReportContext => ({
  reportType: data.reportType,
  fundId: data.fundId,
  lpIds: data.lpIds,
  asOfDate: data.asOfDate,
  preview: data.preview ?? false,
  correlationId: data.correlationId,
  idempotencyKey: data.idempotencyKey,
});

const findExistingReport = async ({ reportType, idempotencyKey }: ReportContext) => {
  if (!idempotencyKey) {
    return null;
  }

  return db.query.documents.findFirst({
    where: and(
      eq(sql`${documents.metadata}->>'idempotencyKey'`, idempotencyKey),
      eq(documents.kind, reportType)
    ),
  });
};

const loadReportInputs = async ({ fundId, lpIds, asOfDate }: ReportContext) => {
  const [fundData, lpData, commitmentData, historicalData] = await Promise.all([
    db.query.funds.findFirst({
      where: eq(funds.id, fundId),
    }),
    db.query.limitedPartners.findMany({
      where: inArray(limitedPartners.id, lpIds),
    }),
    db.query.fundLpCommitments.findMany({
      where: and(
        eq(fundLpCommitments.fundId, fundId),
        inArray(fundLpCommitments.lpId, lpIds),
        lte(fundLpCommitments.validFrom, asOfDate),
        gte(fundLpCommitments.validTo, asOfDate)
      ),
    }),
    db.query.fundSnapshots.findMany({
      where: and(
        eq(fundSnapshots.fundId, fundId),
        lte(fundSnapshots.snapshotTime, asOfDate),
        isNull(fundSnapshots.scenarioSetId)
      ),
      orderBy: desc(fundSnapshots.snapshotTime),
      limit: 10,
    }),
  ]);

  return { fundData, lpData, commitmentData, historicalData };
};

const renderReport = async (
  context: ReportContext,
  inputs: Awaited<ReturnType<typeof loadReportInputs>>
) => {
  const reportData = {
    fund: inputs.fundData,
    limitedPartners: inputs.lpData,
    commitments: inputs.commitmentData,
    historicalData: inputs.historicalData,
    asOfDate: context.asOfDate,
    generatedAt: new Date(),
  };

  let reportBuffer: Buffer;
  switch (context.reportType) {
    case 'capital_account':
      reportBuffer = await generateCapitalAccount(reportData);
      break;
    case 'performance_letter':
      reportBuffer = await generatePerformanceLetter(reportData);
      break;
    default:
      throw new Error(`Unknown report type: ${context.reportType}`);
  }

  if (!context.preview) {
    return reportBuffer;
  }

  const watermarked = addWatermark(reportBuffer);
  logger.info('Added preview watermark to report', {
    originalSize: watermarked.length,
    reportType: context.reportType,
  });
  return watermarked;
};

const storeReportDocument = async (
  context: ReportContext,
  reportBuffer: Buffer,
  historicalData: unknown[],
  startTime: number
) => {
  const [document] = await db
    .insert(documents)
    .values({
      fundId: context.fundId,
      lpId: context.lpIds.length === 1 ? context.lpIds[0] : null,
      kind: context.reportType,
      path: `reports/${context.fundId}/${context.reportType}_${Date.now()}.pdf`,
      preview: context.preview,
      watermarked: context.preview,
      asOfDate: context.asOfDate,
      metadata: {
        lpIds: context.lpIds,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        generationTime: performance.now() - startTime,
        dataPoints: historicalData.length,
      },
      sizeBytes: reportBuffer.length,
    })
    .returning();

  return document;
};

const recordReportMetrics = (
  context: ReportContext,
  inputs: Awaited<ReturnType<typeof loadReportInputs>>,
  startTime: number
) => {
  metrics.histogram('report_generation_duration_ms', performance.now() - startTime, {
    reportType: context.reportType,
    preview: context.preview.toString(),
    lpCount: context.lpIds.length.toString(),
  });

  metrics.counter('reports_generated_total', 1, {
    reportType: context.reportType,
    fundId: context.fundId.toString(),
  });

  const estimatedValue = inputs.lpData.reduce((sum, lp) => {
    const commitment = inputs.commitmentData.find((c) => c.lpId === lp.id);
    return sum + (commitment ? parseFloat(commitment.commitment) * 0.0001 : 0);
  }, 0);

  metrics.gauge('report_business_value_dollars', estimatedValue, {
    reportType: context.reportType,
    customerTier: inputs.fundData?.metadata?.tier || 'standard',
  });
};

const generateReport = async (context: ReportContext, startTime: number) => {
  const inputs = await loadReportInputs(context);
  const reportBuffer = await renderReport(context, inputs);
  const document = await storeReportDocument(
    context,
    reportBuffer,
    inputs.historicalData,
    startTime
  );
  recordReportMetrics(context, inputs, startTime);

  return {
    documentId: document.id,
    path: document.path,
    sizeBytes: document.sizeBytes,
    generationTime: performance.now() - startTime,
  };
};

const findCachedReport = async ({ fundId, reportType, asOfDate }: ReportContext) => {
  const cached = await db.query.documents.findFirst({
    where: and(
      eq(documents.fundId, fundId),
      eq(documents.kind, reportType),
      eq(documents.asOfDate, asOfDate)
    ),
    orderBy: desc(documents.createdAt),
  });

  if (cached) {
    return { documentId: cached.id, cached: true };
  }
  throw new Error('No cached report available');
};

const processReportJob = async (job: Job<ReportJobData>) => {
  const context = toReportContext(job.data);
  logger.info('Processing report generation', {
    reportType: context.reportType,
    fundId: context.fundId,
    lpCount: context.lpIds.length,
    correlationId: context.correlationId,
    jobId: job.id,
  });

  return withMetrics('report_generation', async () => {
    const startTime = performance.now();
    try {
      const existing = await findExistingReport(context);
      if (existing) {
        logger.info('Report already generated (idempotent)', {
          documentId: existing.id,
          idempotencyKey: context.idempotencyKey,
        });
        return { documentId: existing.id, cached: true };
      }

      const cacheKey = `report:${context.fundId}:${context.reportType}:${context.asOfDate.toISOString()}:${context.lpIds.join(',')}`;
      const result = await singleflightEnhanced(
        cacheKey,
        () => generateReport(context, startTime),
        {
          ttl: context.preview ? 60000 : 300000,
          fallback: () => findCachedReport(context),
        }
      );

      await job.updateProgress(100);
      return result;
    } catch (error) {
      logger.error('Report generation failed', {
        error,
        reportType: context.reportType,
        fundId: context.fundId,
        correlationId: context.correlationId,
      });

      metrics.counter('report_generation_errors_total', 1, {
        reportType: context.reportType,
        errorType: error instanceof Error ? error.name : 'unknown',
      });

      throw error;
    }
  });
};

export const reportWorker = new Worker<ReportJobData>(
  'report-generation',
  async (job) => {
    return processReportJob(job);
  },
  {
    connection,
    concurrency: 5, // Process up to 5 reports in parallel
    limiter: {
      max: 100,
      duration: 60000, // Max 100 reports per minute
    },
  }
);

// Register worker for health monitoring
registerWorker('report-generation', reportWorker);

// Start health check server
const HEALTH_PORT = parseInt(process.env.REPORT_WORKER_HEALTH_PORT || '9003');
createHealthServer(HEALTH_PORT);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Report worker shutting down...');
  await reportWorker.close();
});

process.on('SIGINT', async () => {
  logger.info('Report worker received SIGINT, shutting down...');
  await reportWorker.close();
  process.exit(0);
});
