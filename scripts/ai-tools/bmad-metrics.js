import client from 'prom-client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Create a dedicated registry for BMAD metrics
const bmadRegistry = new client.Registry();

// Define metrics
const repairCreated = new client.Counter({
  name: 'bmad_repair_pr_created_total',
  help: 'Total number of repair PRs created',
  labelNames: ['repo', 'pattern'],
  registers: [bmadRegistry],
});

const repairMerged = new client.Counter({
  name: 'bmad_repair_pr_merged_total',
  help: 'Total number of repair PRs merged',
  labelNames: ['repo'],
  registers: [bmadRegistry],
});

const timeSaved = new client.Counter({
  name: 'bmad_repair_time_saved_seconds',
  help: 'Estimated developer time saved in seconds',
  labelNames: ['repo'],
  registers: [bmadRegistry],
});

const failuresFixed = new client.Counter({
  name: 'bmad_failures_fixed_total',
  help: 'Total number of test failures fixed',
  labelNames: ['repo', 'pattern'],
  registers: [bmadRegistry],
});

const repairDuration = new client.Histogram({
  name: 'bmad_repair_duration_ms',
  help: 'Duration of repair operations in milliseconds',
  labelNames: ['repo', 'success'],
  buckets: [1000, 5000, 10000, 30000, 60000, 120000, 180000],
  registers: [bmadRegistry],
});

const repairSuccess = new client.Gauge({
  name: 'bmad_repair_success_rate',
  help: 'Success rate of repair attempts',
  labelNames: ['repo'],
  registers: [bmadRegistry],
});

/**
 * Create metrics collector instance
 */
export function collectBMADMetrics() {
  return {
    recordRepair(metrics) {
      const labels = {
        repo: metrics.repo,
        pattern: metrics.pattern,
      };
      
      // Update counters
      if (metrics.prCreated) {
        repairCreated.inc(labels);
      }
      
      if (metrics.repairsSuccessful > 0) {
        failuresFixed.inc(labels, metrics.repairsSuccessful);
        timeSaved.inc({ repo: metrics.repo }, metrics.timeSavedSeconds);
      }
      
      // Update histogram
      repairDuration.observe(
        { repo: metrics.repo, success: String(metrics.repairsSuccessful > 0) },
        metrics.duration
      );
      
      // Update success rate gauge
      if (metrics.repairsAttempted > 0) {
        const successRate = metrics.repairsSuccessful / metrics.repairsAttempted;
        repairSuccess.set({ repo: metrics.repo }, successRate);
      }
    },
    
    async getMetrics() {
      return await bmadRegistry.metrics();
    },
    
    getRegistry() {
      return bmadRegistry;
    },
  };
}

/**
 * Save BMAD metrics to file for CI artifact collection
 */
export async function saveBMADMetrics(metrics, collector) {
  // Create .bmad directory
  const bmadDir = join(process.cwd(), '.bmad');
  await mkdir(bmadDir, { recursive: true });
  
  // Save JSON metrics
  const jsonPath = join(bmadDir, 'metrics.json');
  await writeFile(jsonPath, JSON.stringify(metrics, null, 2));
  
  // Save Prometheus format metrics
  const promPath = join(bmadDir, 'metrics.prom');
  const promMetrics = await collector.getMetrics();
  await writeFile(promPath, promMetrics);
  
  // Save summary for easy reading
  const summaryPath = join(bmadDir, 'summary.txt');
  const summary = `
BMAD Repair Summary
===================
Timestamp: ${metrics.timestamp}
Repository: ${metrics.repo}
Pattern: ${metrics.pattern}

Results:
--------
Failures Found: ${metrics.failuresFound}
Repairs Attempted: ${metrics.repairsAttempted}
Repairs Successful: ${metrics.repairsSuccessful}
Success Rate: ${metrics.repairsAttempted > 0 ? (metrics.repairsSuccessful / metrics.repairsAttempted * 100).toFixed(1) : 0}%

Impact:
-------
Time Saved: ~${Math.round(metrics.timeSavedSeconds / 60)} minutes
PR Created: ${metrics.prCreated ? 'Yes' : 'No'}
${metrics.prUrl ? `PR URL: ${metrics.prUrl}` : ''}

Duration: ${(metrics.duration / 1000).toFixed(1)} seconds
`.trim();
  
  await writeFile(summaryPath, summary);
  
  console.log(`\n📊 BMAD metrics saved to ${bmadDir}/`);
}