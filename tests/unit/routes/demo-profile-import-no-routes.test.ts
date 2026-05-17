import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE_BOUNDARY_FILES = [
  'server/routes.ts',
  'server/app.ts',
  'client/src/App.tsx',
  'client/src/main.tsx',
];

describe('demo profile import route boundary', () => {
  it('does not mount a public route or client route for the private importer', () => {
    const scanned = ROUTE_BOUNDARY_FILES.map((file) =>
      fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
    ).join('\n');

    expect(scanned).not.toContain('demo-profile');
    expect(scanned).not.toContain('demoProfile');
  });
});
