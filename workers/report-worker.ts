import { Worker } from 'bullmq';
import { db } from '../server/db';
import { documents, communications, limitedPartners, fundLpCommitments } from '@shared/schema';
import { eq, and, desc, lte, gte, inArray } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { singleflightEnhanced } from '../server/utils/singleflight-enhanced';
import { registerWorker, createHealthServer } from './health-server';
import type { ReportGenerationParams } from '@shared/types';

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
const addWatermark = (buffer: Buffer, watermarkText: string = 'PREVIEW - NOT FOR DISTRIBUTION'): Buffer => {
  const content = buffer.toString('utf-8');
  const lines = content.split('\n');

  // Insert watermark at top and throughout document
  const watermarked = [
    '=' .repeat(80),
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

export const reportWorker = new Worker<ReportJobData>(
  'report-generation',
  async (job) => {
    const { 
      reportType, 
      fundId, 
      lpIds, 
      asOfDate, 
      preview = false,
      correlationId,
      idempotencyKey 
    } = job.data;
    
    logger.info('Processing report generation', { 
      reportType, 
      fundId, 
      lpCount: lpIds.length,
      correlationId, 
      jobId: job.id 
    });
    
    return withMetrics('report_generation', async () => {
      const startTime = performance.now();
      
      try {
        // Check idempotency if key provided
        if (idempotencyKey) {
          const existing = await db.query.documents.findFirst({
            where: and(
              eq(documents.metadata->>'idempotencyKey', idempotencyKey),
              eq(documents.kind, reportType)
            )
          });
          
          if (existing) {
            logger.info('Report already generated (idempotent)', { 
              documentId: existing.id,
              idempotencyKey 
            });
            return { documentId: existing.id, cached: true };
          }
        }
        
        // Use singleflight for duplicate requests
        const cacheKey = `report:${fundId}:${reportType}:${asOfDate.toISOString()}:${lpIds.join(',')}`;
        
        const result = await singleflightEnhanced(cacheKey, async () => {
          // Parallel data fetching
          const [fundData, lpData, commitmentData, historicalData] = await Promise.all([
            // Fund data
            db.query.funds.findFirst({
              where: eq(funds.id, fundId)
            }),
            
            // LP data
            db.query.limitedPartners.findMany({
              where: inArray(limitedPartners.id, lpIds)
            }),
            
            // Commitment data with temporal validity
            db.query.fundLpCommitments.findMany({
              where: and(
                eq(fundLpCommitments.fundId, fundId),
                inArray(fundLpCommitments.lpId, lpIds),
                lte(fundLpCommitments.validFrom, asOfDate),
                gte(fundLpCommitments.validTo, asOfDate)
              )
            }),
            
            // Historical snapshots
            db.query.fundSnapshots.findMany({
              where: and(
                eq(fundSnapshots.fundId, fundId),
                lte(fundSnapshots.snapshotTime, asOfDate)
              ),
              orderBy: desc(fundSnapshots.snapshotTime),
              limit: 10
            })
          ]);
          
          // Generate report based on type
          let reportBuffer: Buffer;
          const reportData = {
            fund: fundData,
            limitedPartners: lpData,
            commitments: commitmentData,
            historicalData,
            asOfDate,
            generatedAt: new Date()
          };
          
          switch (reportType) {
            case 'capital_account':
              reportBuffer = await generateCapitalAccount(reportData);
              break;
            case 'performance_letter':
              reportBuffer = await generatePerformanceLetter(reportData);
              break;
            default:
              throw new Error(`Unknown report type: ${reportType}`);
          }
          
          // Add watermark if preview
          if (preview) {
            reportBuffer = addWatermark(reportBuffer);
            logger.info('Added preview watermark to report', {
              originalSize: reportBuffer.length,
              reportType,
            });
          }
          
          // Store document
          const [document] = await db.insert(documents).values({
            fundId,
            lpId: lpIds.length === 1 ? lpIds[0] : null,
            kind: reportType,
            path: `reports/${fundId}/${reportType}_${Date.now()}.pdf`,
            preview,
            watermarked: preview,
            asOfDate,
            metadata: {
              lpIds,
              correlationId,
              idempotencyKey,
              generationTime: performance.now() - startTime,
              dataPoints: historicalData.length
            },
            sizeBytes: reportBuffer.length
          }).returning();
          
          // Record business metrics
          metrics.histogram('report_generation_duration_ms', performance.now() - startTime, {
            reportType,
            preview: preview.toString(),
            lpCount: lpIds.length.toString()
          });
          
          metrics.counter('reports_generated_total', 1, {
            reportType,
            fundId: fundId.toString()
          });
          
          // Calculate business value
          const estimatedValue = lpData.reduce((sum, lp) => {
            const commitment = commitmentData.find(c => c.lpId === lp.id);
            return sum + (commitment ? parseFloat(commitment.commitment) * 0.0001 : 0);
          }, 0);
          
          metrics.gauge('report_business_value_dollars', estimatedValue, {
            reportType,
            customerTier: fundData?.metadata?.tier || 'standard'
          });
          
          return {
            documentId: document.id,
            path: document.path,
            sizeBytes: document.sizeBytes,
            generationTime: performance.now() - startTime
          };
        }, {
          ttl: preview ? 60000 : 300000, // 1 min for preview, 5 min for final
          fallback: async () => {
            // Fallback to cached version if available
            const cached = await db.query.documents.findFirst({
              where: and(
                eq(documents.fundId, fundId),
                eq(documents.kind, reportType),
                eq(documents.asOfDate, asOfDate)
              ),
              orderBy: desc(documents.createdAt)
            });
            
            if (cached) {
              return { documentId: cached.id, cached: true };
            }
            throw new Error('No cached report available');
          }
        });
        
        // Update job progress
        await job.updateProgress(100);
        
        return result;
        
      } catch (error) {
        logger.error('Report generation failed', { 
          error, 
          reportType, 
          fundId,
          correlationId 
        });
        
        metrics.counter('report_generation_errors_total', 1, {
          reportType,
          errorType: error.name
        });
        
        throw error;
      }
    });
  },
  {
    connection,
    concurrency: 5, // Process up to 5 reports in parallel
    limiter: {
      max: 100,
      duration: 60000 // Max 100 reports per minute
    }
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