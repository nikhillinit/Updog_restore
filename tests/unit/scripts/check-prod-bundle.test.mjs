import { describe, expect, it } from 'vitest';
import { findForbiddenModules, findSourceMaps } from '../../../scripts/check-prod-bundle.mjs';

describe('findForbiddenModules', () => {
  it('flags a manifest entry whose source path matches a forbidden substring', () => {
    const manifest = {
      'client/src/components/reports/tear-sheet-dashboard.tsx': {
        file: 'assets/tear-sheet-dashboard-abc123.js',
        src: 'client/src/components/reports/tear-sheet-dashboard.tsx',
        isDynamicEntry: true,
      },
    };
    const hits = findForbiddenModules(manifest, ['tear-sheet-dashboard']);
    expect(hits).toHaveLength(1);
    expect(hits[0].needle).toBe('tear-sheet-dashboard');
  });

  it('returns no hits when the forbidden module is absent', () => {
    const manifest = {
      'client/src/pages/reports.tsx': {
        file: 'assets/reports-def456.js',
        src: 'client/src/pages/reports.tsx',
      },
    };
    expect(findForbiddenModules(manifest, ['tear-sheet-dashboard'])).toEqual([]);
  });
});

describe('findSourceMaps', () => {
  it('returns only .map files', () => {
    expect(findSourceMaps(['a.js', 'a.js.map', 'b.css', 'b.css.map'])).toEqual([
      'a.js.map',
      'b.css.map',
    ]);
  });

  it('returns empty when no maps present', () => {
    expect(findSourceMaps(['a.js', 'b.css'])).toEqual([]);
  });
});
