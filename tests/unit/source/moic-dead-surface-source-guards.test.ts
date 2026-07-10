import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoPath = (relativePath: string) => path.resolve(process.cwd(), relativePath);
const read = (relativePath: string) => fs.readFileSync(repoPath(relativePath), 'utf8');
const exists = (relativePath: string) => fs.existsSync(repoPath(relativePath));

function readClientSource(): string {
  const root = repoPath('client/src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

describe('MOIC dead surface source guards', () => {
  it('keeps the retired V1 MOIC route archived and non-financial', () => {
    const routeDefinitions = read('shared/routes/app-route-definitions.ts');
    expect(routeDefinitions).toContain("path: '/moic-analysis'");
    expect(routeDefinitions).toContain('V1 MOIC analysis retired (#997)');

    // Every quoted route string ending in /moic-analysis must be the canonical
    // fund-scoped placement, regardless of quote style.
    const activeRoutes = read('client/src/app/app-routes.tsx');
    const moicRouteStrings = activeRoutes.match(/["'`][^"'`\n]*\/moic-analysis["'`]/g) ?? [];
    expect(moicRouteStrings.length).toBeGreaterThan(0);
    for (const routeString of moicRouteStrings) {
      expect(routeString).toContain('/fund-model-results/:fundId/moic-analysis');
    }
  });

  it('does not ship the old sample-backed MOIC component', () => {
    expect(exists('client/src/components/portfolio/moic-analysis.tsx')).toBe(false);

    const clientSource = readClientSource();
    expect(clientSource).not.toContain('sampleMOICData');
    expect(clientSource).not.toContain('optimal reserve deployment');
  });
});
