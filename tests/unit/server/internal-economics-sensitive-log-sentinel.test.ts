import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('internal-economics route sensitive-log sentinel', () => {
  it('keeps request, receipt, identity, and hash values out of route logging', async () => {
    const source = await readFile(
      path.resolve(process.cwd(), 'server/routes/internal-economics.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/\b(?:logger|console)\b/);
    expect(source).not.toMatch(/\b(?:log|warn|error|info|debug)\s*\(/);
    expect(source).not.toMatch(/(?:telemetry|metrics?)\s*\./);
  });
});
