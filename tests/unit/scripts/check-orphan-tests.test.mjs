import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const checker = path.resolve(process.cwd(), 'scripts', 'check-orphan-tests.mjs');

function runChecker(...paths) {
  return spawnSync(process.execPath, [checker, ...paths], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

describe('orphan test discovery guard', () => {
  it('matches root Vitest discovery for colocated TypeScript tests', () => {
    const discovered = runChecker(
      'client/src/components/__tests__/widget.test.tsx',
      'client/src/lib/__tests__/parser.spec.ts',
      'server/services/__tests__/service.test.ts',
      'server/routes/__tests__/route.spec.tsx',
      'shared/utils/__tests__/math.test.ts',
      './shared/types/__tests__/contract.spec.tsx'
    );

    expect(discovered.status).toBe(0);

    for (const undiscoveredPath of [
      'client/src/components/__tests__/widget.test.jsx',
      'server/services/__tests__/service.spec.js',
      'tools/__tests__/tool.test.ts',
    ]) {
      const undiscovered = runChecker(undiscoveredPath);

      expect(undiscovered.status).toBe(1);
      expect(undiscovered.stderr).toContain(undiscoveredPath);
    }
  });
});
