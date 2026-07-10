import { describe, expect, it } from 'vitest';
import { findForbiddenModules, findSourceMaps, QUARANTINED_MODULES } from '../../../scripts/check-prod-bundle.mjs';

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

describe('mock-route quarantine extension', () => {
  const newlyQuarantined = [
    'reserves-demo',
    'allocation-manager',
    'cash-management',
    'portfolio-analytics',
    'CapTables',
  ];

  it('lists every mock-backed route module', () => {
    for (const mod of newlyQuarantined) {
      expect(QUARANTINED_MODULES).toContain(mod);
    }
  });

  it('flags a manifest entry for each quarantined mock route', () => {
    const manifest = Object.fromEntries(
      newlyQuarantined.map((m) => [`pages/${m}.tsx`, { file: `assets/${m}-abc123.js` }])
    );
    const hits = findForbiddenModules(manifest, QUARANTINED_MODULES);
    expect(hits.map((h) => h.needle).sort()).toEqual([...newlyQuarantined].sort());
  });
});

describe('v2 reference-screen quarantine', () => {
  it('quarantines the pages/v2 reference screens', () => {
    expect(QUARANTINED_MODULES).toContain('pages/v2/');
  });

  it('flags a v2 reference page in the manifest', () => {
    const manifest = {
      'client/src/pages/v2/today.tsx': {
        file: 'assets/today-abc123.js',
        src: 'client/src/pages/v2/today.tsx',
        isDynamicEntry: true,
      },
    };
    const hits = findForbiddenModules(manifest, QUARANTINED_MODULES);
    expect(hits.map((h) => h.needle)).toContain('pages/v2/');
  });
});
