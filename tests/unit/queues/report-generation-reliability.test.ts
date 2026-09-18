import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('local report generation reliability', () => {
  it('never marks a synthetic file URL as uploaded', async () => {
    const source = await readFile('server/queues/report-generation-queue.ts', 'utf8');
    expect(source).not.toContain('`/reports/${reportId}.${format}`');
    expect(source).toMatch(/const uploadResult = await storage\.upload/);
    expect(source).toMatch(/emitFailed[\s\S]*throw error/);
  });
});
