/**
 * Phase 2A Item 1: DB-enforced config invariants
 * Item 2: Queue name fix
 * Item 3: Reserve snapshotTime fix
 *
 * Tests for structural correctness of constraints, queue names, and snapshot inserts.
 *
 * @group phase2a
 */

import { describe, it, expect } from 'vitest';
import { fundConfigs, fundSnapshots } from '@shared/schema';
import { QUEUE_CATALOG } from '../../../server/queues/registry';

// ============================================================================
// Item 1: Config invariant constraint documentation
// ============================================================================

describe('FundConfigs schema invariants', () => {
  it('fundConfigs has isDraft and isPublished columns', () => {
    // Structural check: these columns exist in the Drizzle schema
    expect(fundConfigs.isDraft).toBeDefined();
    expect(fundConfigs.isPublished).toBeDefined();
    expect(fundConfigs.publishedAt).toBeDefined();
  });

  it('fundConfigs has fundId FK and version', () => {
    expect(fundConfigs.fundId).toBeDefined();
    expect(fundConfigs.version).toBeDefined();
  });

  it('fundSnapshots has snapshotTime column (NOT NULL)', () => {
    expect(fundSnapshots.snapshotTime).toBeDefined();
  });
});

// ============================================================================
// Item 2: Queue name consistency
// ============================================================================

describe('Queue name consistency', () => {
  it('registry defines pacing-calc with hyphen (not colon)', () => {
    const pacingEntry = QUEUE_CATALOG.find((e) => e.key === 'pacing-calc');
    expect(pacingEntry).toBeDefined();
    expect(pacingEntry!.queueName).toBe('pacing-calc');
    // Must NOT contain colon
    expect(pacingEntry!.queueName).not.toContain(':');
  });

  it('registry defines cohort-calc with hyphen (not colon)', () => {
    const cohortEntry = QUEUE_CATALOG.find((e) => e.key === 'cohort-calc');
    expect(cohortEntry).toBeDefined();
    expect(cohortEntry!.queueName).toBe('cohort-calc');
    expect(cohortEntry!.queueName).not.toContain(':');
  });

  it('registry defines reserve-calc with hyphen', () => {
    const reserveEntry = QUEUE_CATALOG.find((e) => e.key === 'reserve-calc');
    expect(reserveEntry).toBeDefined();
    expect(reserveEntry!.queueName).toBe('reserve-calc');
  });

  it('registry defines economics-calc with hyphen', () => {
    const economicsEntry = QUEUE_CATALOG.find((e) => e.key === 'economics-calc');
    expect(economicsEntry).toBeDefined();
    expect(economicsEntry!.queueName).toBe('economics-calc');
  });

  it('all calc queue names use hyphen separator consistently', () => {
    const calcQueues = QUEUE_CATALOG.filter((e) => e.key.endsWith('-calc'));
    expect(calcQueues.length).toBe(5);
    for (const entry of calcQueues) {
      expect(entry.queueName).toMatch(/^[a-z]+(?:-[a-z]+)*-calc$/);
    }
  });
});

// ============================================================================
// Item 2 continued: Worker queue names match registry
// ============================================================================

describe('Worker queue names match registry', () => {
  it('pacing worker uses pacing-calc (not pacing:calc)', async () => {
    // Read the worker source and verify the queue name string
    const workerSource = await import('fs/promises').then((fs) =>
      fs.readFile('workers/pacing-worker.ts', 'utf-8')
    );
    // The Worker constructor call must use 'pacing-calc'
    expect(workerSource).toContain("'pacing-calc'");
    expect(workerSource).not.toContain("'pacing:calc'");
  });

  it('cohort worker uses cohort-calc (not cohort:calc)', async () => {
    const workerSource = await import('fs/promises').then((fs) =>
      fs.readFile('workers/cohort-worker.ts', 'utf-8')
    );
    expect(workerSource).toContain("'cohort-calc'");
    expect(workerSource).not.toContain("'cohort:calc'");
  });

  it('reserve worker uses reserve-calc', async () => {
    const workerSource = await import('fs/promises').then((fs) =>
      fs.readFile('workers/reserve-worker.ts', 'utf-8')
    );
    expect(workerSource).toContain("'reserve-calc'");
  });

  it('fund scenario calc worker uses fund-scenario-calc', async () => {
    const workerSource = await import('fs/promises').then((fs) =>
      fs.readFile('workers/fund-scenario-calc-worker.ts', 'utf-8')
    );
    expect(workerSource).toContain("'fund-scenario-calc'");
  });
});

// ============================================================================
// Item 3: Reserve snapshot includes snapshotTime
// ============================================================================

describe('Reserve/pacing calculation service snapshotTime', () => {
  it('reserve calculation service insert includes snapshotTime field', async () => {
    const workerSource = await import('fs/promises').then((fs) =>
      fs.readFile('server/services/reserve-calculation-service.ts', 'utf-8')
    );
    // The insert values block must include snapshotTime
    expect(workerSource).toContain('snapshotTime');
    // Specifically: snapshotTime: new Date()
    expect(workerSource).toMatch(/snapshotTime:\s*new Date\(\)/);
  });

  it('pacing calculation service insert includes snapshotTime field', async () => {
    const workerSource = await import('fs/promises').then((fs) =>
      fs.readFile('server/services/pacing-calculation-service.ts', 'utf-8')
    );
    expect(workerSource).toMatch(/snapshotTime:\s*new Date\(\)/);
  });
});

// ============================================================================
// Item 1: Migration file exists
// ============================================================================

describe('Migration 0008 exists', () => {
  it('migration file for config invariants exists', async () => {
    const fs = await import('fs/promises');
    const stat = await fs.stat('server/db/migrations/0008_fundconfig_invariants.sql');
    expect(stat.isFile()).toBe(true);
  });

  it('migration contains cleanup + constraints', async () => {
    const fs = await import('fs/promises');
    const sql = await fs.readFile('server/db/migrations/0008_fundconfig_invariants.sql', 'utf-8');
    // Cleanup
    expect(sql).toContain('ranked_drafts');
    expect(sql).toContain('ranked_published');
    // Constraints
    expect(sql).toContain('fundconfigs_one_draft_per_fund');
    expect(sql).toContain('fundconfigs_one_published_per_fund');
    expect(sql).toContain('chk_not_draft_and_published');
    expect(sql).toContain('chk_draft_no_published_at');
    expect(sql).toContain('chk_published_has_published_at');
  });
});
