/**
 * Phase 2A Items 4 & 5: Atomic create + version semantics
 *
 * Tests for FundPersistenceService and version allocation in draft upsert.
 *
 * @group phase2a
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Item 4: FundPersistenceService structure
// ============================================================================

describe('FundPersistenceService', () => {
  it('exports a singleton instance', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    expect(mod.fundPersistenceService).toBeDefined();
    expect(mod.FundPersistenceService).toBeDefined();
  });

  it('has createFundWithInitialDraft method', async () => {
    const { fundPersistenceService } =
      await import('../../../server/services/fund-persistence-service');
    expect(typeof fundPersistenceService.createFundWithInitialDraft).toBe('function');
  });

  it('has allocateNextVersion method', async () => {
    const { fundPersistenceService } =
      await import('../../../server/services/fund-persistence-service');
    expect(typeof fundPersistenceService.allocateNextVersion).toBe('function');
  });

  it('has saveDraftConfig and getDraftConfig methods', async () => {
    const { fundPersistenceService } =
      await import('../../../server/services/fund-persistence-service');
    expect(typeof fundPersistenceService.saveDraftConfig).toBe('function');
    expect(typeof fundPersistenceService.getDraftConfig).toBe('function');
  });
});

// ============================================================================
// Item 4: Route integration -- funds.ts uses service
// ============================================================================

describe('Funds route uses FundPersistenceService', () => {
  it('funds.ts imports fundPersistenceService', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/routes/funds.ts', 'utf-8');
    expect(source).toContain('fundPersistenceService');
    expect(source).toContain('createFundWithInitialDraft');
  });

  it('funds.ts no longer calls storage.createFund directly', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/routes/funds.ts', 'utf-8');
    expect(source).not.toContain('storage.createFund');
  });
});

// ============================================================================
// Item 5: Version allocation in draft upsert
// ============================================================================

describe('Draft upsert version allocation', () => {
  it('service INSERT path queries MAX(version)', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    // Must contain max(fundConfigs.version) query
    expect(source).toContain('max(fundConfigs.version)');
    // Must use nextVersion in insert
    expect(source).toContain('nextVersion');
    expect(source).toContain('version: nextVersion');
  });

  it('service imports max from drizzle-orm', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    expect(source).toMatch(/import\s*\{[^}]*max[^}]*\}\s*from\s*'drizzle-orm'/);
  });

  it('fund-config.ts draft routes delegate to the service', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/routes/fund-config.ts', 'utf-8');
    expect(source).toContain('fundPersistenceService.saveDraftConfig');
    expect(source).toContain('fundPersistenceService.getDraftConfig');
  });
});

// ============================================================================
// Item 4: Service file structure
// ============================================================================

describe('FundPersistenceService internals', () => {
  it('service uses db.transaction for atomic create', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    expect(source).toContain('db.transaction');
    // Must insert into funds AND fundConfigs within transaction
    expect(source).toContain('tx');
    expect(source).toContain('funds');
    expect(source).toContain('fundConfigs');
  });

  it('service inserts FUND_CREATED audit event', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    expect(source).toContain('FUND_CREATED');
    expect(source).toContain('fundEvents');
  });

  it('service defaults to empty config when configInput omitted', async () => {
    const fs = await import('fs/promises');
    const source = await fs.readFile('server/services/fund-persistence-service.ts', 'utf-8');
    // configInput ?? {} pattern
    expect(source).toContain('configInput ?? {}');
  });
});
