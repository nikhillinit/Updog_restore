import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENT_DIR = path.resolve(process.cwd(), 'client/src/components/fund-results');
const FORBIDDEN_IMPORT = /FundMoicFactsBasisV1|REASON_COPY|components\/moic|fund-moic-v1/;

describe('fund-results sources stay decoupled from the MOIC domain', () => {
  it('has no MOIC imports in any fund-results component source', () => {
    const files = readdirSync(COMPONENT_DIR).filter(
      (file) => file.endsWith('.ts') || file.endsWith('.tsx')
    );
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(path.join(COMPONENT_DIR, file), 'utf8');
      const importStatements = source.match(/(?:import|export)[^;]*?from\s*['"][^'"]+['"]/g) ?? [];
      for (const statement of importStatements) {
        if (FORBIDDEN_IMPORT.test(statement)) {
          violations.push(`${file}: ${statement.replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
