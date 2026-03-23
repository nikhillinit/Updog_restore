/**
 * Phase 2A Items 6, 7, 8:
 * - calcRuns table schema
 * - Publish service extraction
 * - Snapshot attribution columns + worker binding
 *
 * @group phase2a
 */

import { describe, it, expect } from 'vitest';
import { calcRuns, fundSnapshots } from '@shared/schema';

// ============================================================================
// Item 6: calcRuns table schema
// ============================================================================

describe('calcRuns table schema', () => {
  it('has id, fundId, configId, configVersion columns', () => {
    expect(calcRuns.id).toBeDefined();
    expect(calcRuns.fundId).toBeDefined();
    expect(calcRuns.configId).toBeDefined();
    expect(calcRuns.configVersion).toBeDefined();
  });

  it('has correlationId unique column', () => {
    expect(calcRuns.correlationId).toBeDefined();
  });

  it('has engines jsonb column', () => {
    expect(calcRuns.engines).toBeDefined();
  });

  it('has dispatchState column', () => {
    expect(calcRuns.dispatchState).toBeDefined();
  });

  it('has timestamp columns for lifecycle', () => {
    expect(calcRuns.requestedAt).toBeDefined();
    expect(calcRuns.dispatchedAt).toBeDefined();
    expect(calcRuns.completedAt).toBeDefined();
    expect(calcRuns.failedAt).toBeDefined();
  });

  it('has lastError text column', () => {
    expect(calcRuns.lastError).toBeDefined();
  });

  it('exports CalcRun and NewCalcRun types', async () => {
    const mod = await import('@shared/schema/fund');
    // Type existence check: these should be exported
    expect(mod).toHaveProperty('calcRuns');
  });
});

// ============================================================================
// Item 6: Migration exists
// ============================================================================

describe('Migration 0009 (calcRuns)', () => {
  it('migration file exists', async () => {
    const fs = await import('fs/promises');
    const stat = await fs.stat('server/db/migrations/0009_calc_runs.sql');
    expect(stat.isFile()).toBe(true);
  });

  it('contains calc_runs table definition', async () => {
    const fs = await import('fs/promises');
    const sql = await fs.readFile('server/db/migrations/0009_calc_runs.sql', 'utf-8');
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('calc_runs');
    expect(sql).toContain('dispatch_state');
    expect(sql).toContain('correlation_id');
    expect(sql).toContain('config_id');
  });
});

// ============================================================================
// Item 7: Publish service extraction
// ============================================================================

describe('FundPersistenceService.publishDraft', () => {
  it('service has publishDraft method', async () => {
    const { fundPersistenceService } =
      await import('../../../server/services/fund-persistence-service');
    expect(typeof fundPersistenceService.publishDraft).toBe('function');
  });

  it('service file uses db.transaction for publish', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    // publishDraft wraps in transaction
    expect(source).toContain('publishDraft');
    expect(source).toContain('db.transaction');
  });

  it('service creates calcRun with pending state', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    expect(source).toContain("dispatchState: 'pending'");
    expect(source).toContain('calcRuns');
  });

  it('service dispatches with deterministic jobIds', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    // jobId = 'run:<runId>:<engine>'
    expect(source).toMatch(/jobId.*run:.*:.*engine/);
  });

  it('service handles dispatch failure states', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    expect(source).toContain("'dispatched'");
    expect(source).toContain("'partial'");
    expect(source).toContain("'failed'");
  });

  it('service inserts PUBLISHED and CALC_TRIGGERED events', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    expect(source).toContain("'PUBLISHED'");
    expect(source).toContain("'CALC_TRIGGERED'");
  });

  it('fund-config.ts publish route delegates to service', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/routes/fund-config.ts', 'utf-8');
    expect(source).toContain('fundPersistenceService');
    expect(source).toContain('publishDraft');
  });
});

// ============================================================================
// Item 7: Idempotency -- publish checks for pending run
// ============================================================================

describe('Publish idempotency', () => {
  it('service reuses pending, partial, and dispatched runs when no draft remains', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    expect(source).toContain("dispatchState === 'pending'");
    expect(source).toContain("dispatchState === 'partial'");
    expect(source).toContain("dispatchState !== 'dispatched'");
  });
});

// ============================================================================
// Item 8: Snapshot attribution columns
// ============================================================================

describe('fundSnapshots attribution columns', () => {
  it('has runId nullable column', () => {
    expect(fundSnapshots.runId).toBeDefined();
  });

  it('has configId nullable column', () => {
    expect(fundSnapshots.configId).toBeDefined();
  });

  it('has configVersion nullable column', () => {
    expect(fundSnapshots.configVersion).toBeDefined();
  });
});

describe('Migration 0010 (snapshot attribution)', () => {
  it('migration file exists', async () => {
    const fs = await import('fs/promises');
    const stat = await fs.stat('server/db/migrations/0010_snapshot_attribution.sql');
    expect(stat.isFile()).toBe(true);
  });

  it('adds run_id, config_id, config_version columns', async () => {
    const fs = await import('fs/promises');
    const sql = await fs.readFile('server/db/migrations/0010_snapshot_attribution.sql', 'utf-8');
    expect(sql).toContain('run_id');
    expect(sql).toContain('config_id');
    expect(sql).toContain('config_version');
    expect(sql).toContain('fund_snapshots');
  });
});

// ============================================================================
// Item 8: Worker binding -- workers accept run attribution
// ============================================================================

describe('Worker snapshot attribution', () => {
  it('reserve worker destructures runId/configId/configVersion', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('workers/reserve-worker.ts', 'utf-8');
    expect(source).toContain('runId');
    expect(source).toContain('configId');
    expect(source).toContain('configVersion');
    // Written to snapshot
    expect(source).toMatch(/runId != null && \{ runId \}/);
  });

  it('pacing worker destructures runId/configId/configVersion', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('workers/pacing-worker.ts', 'utf-8');
    expect(source).toContain('runId');
    expect(source).toContain('configId');
    expect(source).toContain('configVersion');
    expect(source).toMatch(/runId != null && \{ runId \}/);
  });

  it('cohort worker accepts runId/configId/configVersion (no snapshot yet)', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('workers/cohort-worker.ts', 'utf-8');
    expect(source).toContain('runId');
    expect(source).toContain('configId');
    expect(source).toContain('configVersion');
  });

  it('pacing worker job data interface includes attribution fields', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('workers/pacing-worker.ts', 'utf-8');
    expect(source).toContain('runId?: number');
    expect(source).toContain('configId?: number');
    expect(source).toContain('configVersion?: number');
  });
});
