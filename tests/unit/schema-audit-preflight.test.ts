import { describe, expect, it } from 'vitest';

import { runSchemaAuditPreflight } from '../../scripts/schema-audit-preflight.mjs';

describe('schema-audit-preflight', () => {
  it('skips with no DATABASE_URL', async () => {
    const result = await runSchemaAuditPreflight({ databaseUrl: undefined });

    expect(result).toMatchObject({ status: 'skipped', ok: true });
    expect(result.message).toContain('schema audit skipped: no direct DATABASE_URL');
  });

  it('skips memory and pooler URLs', async () => {
    await expect(runSchemaAuditPreflight({ databaseUrl: 'memory://' })).resolves.toMatchObject({
      status: 'skipped',
      ok: true,
    });
    await expect(
      runSchemaAuditPreflight({ databaseUrl: 'postgres://x-pooler.neon.tech/db' })
    ).resolves.toMatchObject({ status: 'skipped', ok: true });
  });

  it('runs audit-only with a direct URL', async () => {
    let captured: string[] = [];

    const result = await runSchemaAuditPreflight({
      databaseUrl: 'postgres://user:pass@direct.neon.tech/db',
      manifestDir: 'custom/manifests',
      runReconcile: (args: string[]) => {
        captured = args;
        return { code: 0, stdout: '', stderr: '' };
      },
    });

    expect(result).toMatchObject({ status: 'audited', ok: true });
    expect(captured).toContain('--manifest-dir');
    expect(captured).toContain('custom/manifests');
    expect(captured).not.toContain('--apply');
    expect(captured).not.toContain('--yes');
  });

  it('passes the expected database to the audit command', async () => {
    let captured: string[] = [];

    await runSchemaAuditPreflight({
      databaseUrl: 'postgres://user:pass@direct.neon.tech/db',
      expectedDb: 'updog_prod',
      runReconcile: (args: string[]) => {
        captured = args;
        return { code: 0, stdout: '', stderr: '' };
      },
    });

    expect(captured).toContain('--expect-db');
    expect(captured).toContain('updog_prod');
    expect(captured).not.toContain('--apply');
    expect(captured).not.toContain('--yes');
  });

  it('surfaces audit failure', async () => {
    const result = await runSchemaAuditPreflight({
      databaseUrl: 'postgres://user:pass@direct.neon.tech/db',
      runReconcile: () => ({ code: 1 }),
    });

    expect(result).toMatchObject({ status: 'audited', ok: false, code: 1 });
  });
});
