import { Worker } from 'bullmq';
import { db } from '../server/db';
import { documents, communications, limitedPartners, fundLpCommitments } from '@shared/schema';
import { eq, and, desc, lte, gte, inArray } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { singleflightEnhanced } from '../server/utils/singleflight-enhanced';
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

// Report generation templates
const generateCapitalAccount = async (data: any) => {
  // TODO: Implement actual PDF generation
  return Buffer.from(`Capital Account Report\n${JSON.stringify(data, null, 2)}`);
};

const generatePerformanceLetter = async (data: any) => {
  // TODO: Implement actual PDF generation
  return Buffer.from(`Performance Letter\n${JSON.stringify(data, null, 2)}`);
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
            // TODO: Add actual watermarking logic
            logger.info('Adding preview watermark to report');
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Report worker shutting down...');
  await reportWorker.close();
});