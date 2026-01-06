/**
 * Cache Warming Service
 *
 * Pre-generates scenario matrices for common configurations to warm the cache.
 * Uses the existing BullMQ 'scenario-generation' queue with configurable priority.
 *
 * Priority levels:
 * - high (1): Immediate processing, bypasses queue limits
 * - low (10): Background processing, lower priority
 */

import { Queue } from 'bullmq';
import type { ScenarioConfigWithMeta } from '@shared/core/optimization/ScenarioMatrixCache';

/**
 * Cache warming parameters
 */
export interface WarmingParams {
  fundIds: string[];
  taxonomyVersion: string;
  priority: 'high' | 'low';
  configs: Omit<ScenarioConfigWithMeta, 'fundId' | 'taxonomyVersion'>[];
}

/**
 * Cache warming result
 */
export interface WarmingResult {
  scheduled: number;
  estimated: {
    totalDurationMs: number;
    completionTime: string;
  };
  jobs: Array<{
    jobId: string;
    configHash: string;
    status: string;
  }>;
}

export class CacheWarmingService {
  /**
   * Warm cache by pre-generating matrices for specified configurations
   */
  static async warm(params: WarmingParams): Promise<WarmingResult> {
    // Initialize BullMQ queue
    const queue = new Queue('scenario-generation', {
      connection: {
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      },
    });

    const jobs: Array<{ jobId: string; configHash: string; status: string }> = [];

    try {
      // Schedule jobs for each fundId × config combination
      for (const fundId of params.fundIds) {
        for (const config of params.configs) {
          const fullConfig: ScenarioConfigWithMeta = {
            ...config,
            fundId,
            taxonomyVersion: params.taxonomyVersion,
          };

          // Add job to queue with priority
          const job = await queue.add('warm-cache', fullConfig, {
            priority: params.priority === 'high' ? 1 : 10,
            attempts: 3, // Retry up to 3 times
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          });

          jobs.push({
            jobId: job.id!,
            configHash: `${fundId}-config-${jobs.length + 1}`,
            status: 'pending',
          });
        }
      }

      // Estimate completion time
      const avgDurationMs = 250; // Average matrix generation time
      const estimatedDurationMs = jobs.length * avgDurationMs;
      const completionTime = new Date(Date.now() + estimatedDurationMs).toISOString();

      console.log(
        `[CacheWarming] Scheduled ${jobs.length} cache warm jobs ` +
          `(priority: ${params.priority}, estimated: ${estimatedDurationMs}ms)`
      );

      return {
        scheduled: jobs.length,
        estimated: {
          totalDurationMs: estimatedDurationMs,
          completionTime,
        },
        jobs,
      };
    } catch (error) {
      console.error('[CacheWarming] Job scheduling error:', error);
      throw error;
    } finally {
      // Close queue connection
      await queue.close();
    }
  }
}
