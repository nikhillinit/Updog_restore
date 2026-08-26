#!/usr/bin/env node
/**
 * AI DLQ Replay CLI
 * Replays failed jobs from the dead letter queue
 *
 * Usage:
 *   npm run ai:dlq:replay <jobId>
 *   npm run ai:dlq:replay --list
 *   npm run ai:dlq:replay --stats
 */

import { readDLQ, getDLQStats, deleteDLQEntry } from '../workers/dlq';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case '--list':
      await listFailedJobs();
      break;

    case '--stats':
      await showStats();
      break;

    default:
      await replayJob(command);
      break;
  }
}

async function listFailedJobs() {
  console.log('📋 Fetching failed jobs from DLQ...\n');

  const entries = await readDLQ(50);

  if (entries.length === 0) {
    console.log('✅ No failed jobs in DLQ');
    return;
  }

  console.log(`Found ${entries.length} failed jobs:\n`);

  entries.forEach(({ entryId, job }) => {
    console.log(`ID: ${job.id}`);
    console.log(`  Entry ID: ${entryId}`);
    console.log(`  Operation: ${job.operation}`);
    console.log(`  Reason: ${job.reason}`);
    console.log(`  Timestamp: ${new Date(job.timestamp).toISOString()}`);
    console.log(`  Retries: ${job.retries || 0}`);
    if (job.error) {
      console.log(`  Error: ${job.error}`);
    }
    console.log('');
  });
}

async function showStats() {
  console.log('📊 DLQ Statistics\n');

  const stats = await getDLQStats();

  console.log(`Total Entries: ${stats.totalEntries}`);

  if (stats.oldestTimestamp) {
    console.log(`Oldest: ${new Date(stats.oldestTimestamp).toISOString()}`);
  }

  if (stats.newestTimestamp) {
    console.log(`Newest: ${new Date(stats.newestTimestamp).toISOString()}`);
  }
}

async function replayJob(jobId: string) {
  console.log(`🔄 Replaying job: ${jobId}\n`);

  const entries = await readDLQ(500);
  const found = entries.find(({ job }) => job.id === jobId);

  if (!found) {
    console.error(`❌ Job ${jobId} not found in DLQ`);
    process.exit(2);
  }

  const { entryId, job } = found;

  console.log('Job details:');
  console.log(`  Operation: ${job.operation}`);
  console.log(`  Reason: ${job.reason}`);
  console.log(`  Payload: ${JSON.stringify(job.payload, null, 2)}`);
  console.log('');

  // TODO: Implement actual replay logic
  // This would re-enqueue the job to the original queue/topic
  // For now, just dry-run
  console.log('⚠️  DRY RUN: Replay logic not yet implemented');
  console.log('    In production, this would:');
  console.log(`    1. Re-enqueue job to original queue: ${job.operation}`);
  console.log('    2. Mark entry as replayed');
  console.log(`    3. Delete DLQ entry: ${entryId}`);

  // Uncomment when replay logic is ready:
  // await replayJobToQueue(job);
  // await deleteDLQEntry(entryId);
  // console.log('✅ Job replayed successfully');
}

function printHelp() {
  console.log(`
AI DLQ Replay CLI

Usage:
  npm run ai:dlq:replay <jobId>   Replay a specific job
  npm run ai:dlq:replay --list    List all failed jobs
  npm run ai:dlq:replay --stats   Show DLQ statistics
  npm run ai:dlq:replay --help    Show this help

Examples:
  npm run ai:dlq:replay abc-123-def
  npm run ai:dlq:replay --list
  npm run ai:dlq:replay --stats
`);
}

// Run if called directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main };
