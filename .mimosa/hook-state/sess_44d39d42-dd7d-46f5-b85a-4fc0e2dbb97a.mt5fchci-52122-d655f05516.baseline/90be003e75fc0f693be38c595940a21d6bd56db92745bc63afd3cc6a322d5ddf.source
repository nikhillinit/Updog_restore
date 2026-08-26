// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { resolve } from 'node:path';

const machinePath = resolve(process.cwd(), 'client/src/machines/modeling-wizard.machine.ts');

function readMachineSource(): string {
  return fs.readFileSync(machinePath, 'utf8');
}

describe('modeling wizard submit transport wiring', () => {
  it('uses the API base helper for the direct machine submit path', () => {
    const source = readMachineSource();

    expect(source).toContain("import { withApiBase } from '@/lib/api-url';");
    expect(source).toContain("fetch(withApiBase('/api/funds'), {");
  });

  it('includes credentials on the direct machine submit path', () => {
    const source = readMachineSource();

    expect(source).toMatch(
      /fetch\(withApiBase\('\/api\/funds'\),\s*\{[\s\S]*credentials:\s*'include'/
    );
  });
});
