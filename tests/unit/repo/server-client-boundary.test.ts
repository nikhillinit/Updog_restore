import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';

interface ClientAliasImport {
  file: string;
  line: number;
  specifier: string;
}

const clientAliasImportPattern = /^\s*import\b.*\bfrom\s+['"](@\/[^'"]+)['"]/;

async function findServerClientAliasImports(): Promise<ClientAliasImport[]> {
  const files = await glob(['server/**/*.ts', 'workers/**/*.ts'], {
    ignore: ['**/*.d.ts'],
    nodir: true,
    windowsPathsNoEscape: true,
  });

  const violations: ClientAliasImport[] = [];

  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      const match = clientAliasImportPattern.exec(line);
      if (match?.[1]) {
        violations.push({
          file,
          line: index + 1,
          specifier: match[1],
        });
      }
    });
  }

  return violations;
}

describe('server/client module boundary', () => {
  it('does not import client alias modules from server or worker code', async () => {
    await expect(findServerClientAliasImports()).resolves.toEqual([]);
  });
});
