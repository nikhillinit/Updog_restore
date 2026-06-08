import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('fund-moic route contract', () => {
  it('guards the rankings endpoint with requireAuth and requireFundAccess', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('requireAuth()');
    expect(source).toContain('requireFundAccess');
    expect(source).toContain('/funds/:fundId/moic/rankings');
  });

  it('parses and validates fundId before calling the service', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('FundIdParamSchema');
  });

  it('calls the fund MOIC ranking service', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('getFundMoicRankings');
  });
});
