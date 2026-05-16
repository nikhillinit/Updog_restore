import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';

const phase4BoundaryFiles = [
  'server/routes.ts',
  'server/routes/funds.ts',
  'server/routes/calculations.ts',
  'server/contracts/funds-endpoint-ownership.ts',
  'server/services/projected-metrics-calculator.ts',
  'workers/reserve-worker.ts',
  'workers/pacing-worker.ts',
  'workers/cohort-worker.ts',
] as const;

/**
 * Restricted import patterns for server/worker code.
 *
 * Two bypass vectors:
 *   1. Raw relative paths: ../client/src/...
 *   2. Alias paths: @/ maps to client/src/* (tsconfig.json).
 *      Only @shared/ and @server/ are safe for server/worker use.
 *
 * Strategy: allowlist of safe alias prefixes; everything else from @/ or
 * client/src/ is a violation for the canonical Phase 4 files, including the
 * authoritative router owner and ownership manifest.
 */
const SAFE_ALIAS_PREFIXES = ['@shared/', '@shared', '@server/', '@server'] as const;

function isRestrictedSpecifier(specifier: string): string | null {
  // Vector 1: raw relative path into client/src/
  if (/client\/src\//.test(specifier)) {
    return `raw client/src/ path: ${specifier}`;
  }

  // Vector 2: @/ alias that maps to client/src/
  if (specifier.startsWith('@/')) {
    if (!SAFE_ALIAS_PREFIXES.some((p) => specifier.startsWith(p))) {
      return `@/ alias resolving to client/src/: ${specifier}`;
    }
  }

  return null;
}

const importSpecifierPattern =
  /from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|export\s+\*\s+from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"];/gm;

async function getImportSpecifiers(relativePath: string): Promise<string[]> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const source = await readFile(absolutePath, 'utf8');

  return [...source.matchAll(importSpecifierPattern)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? '')
    .filter(Boolean);
}

describe('Phase 4 boundary regression guard', () => {
  it.each(phase4BoundaryFiles)(
    '%s does not import runtime logic from client/ or client-alias paths',
    async (filePath) => {
      const specifiers = await getImportSpecifiers(filePath);
      const violations = specifiers.map(isRestrictedSpecifier).filter(Boolean);

      expect(violations).toEqual([]);
    }
  );
});

describe('boundary pattern unit tests (synthetic)', () => {
  it('rejects raw client/src/ paths (any subdirectory)', () => {
    expect(isRestrictedSpecifier('../client/src/core/reserves/ReserveEngine')).toBeTruthy();
    expect(isRestrictedSpecifier('../../client/src/lib/fund-calc')).toBeTruthy();
    expect(isRestrictedSpecifier('../client/src/utils/resilientLimit')).toBeTruthy();
    expect(isRestrictedSpecifier('../client/src/components/Dashboard')).toBeTruthy();
    expect(isRestrictedSpecifier('../client/src/hooks/useFundData')).toBeTruthy();
  });

  it('rejects @/ alias paths that resolve to client/src/', () => {
    expect(isRestrictedSpecifier('@/core/reserves/ReserveEngine')).toBeTruthy();
    expect(isRestrictedSpecifier('@/lib/fund-calc')).toBeTruthy();
    expect(isRestrictedSpecifier('@/utils/resilientLimit')).toBeTruthy();
  });

  it('rejects @/ aliases starting with s (not @shared)', () => {
    expect(isRestrictedSpecifier('@/stores/fundStore')).toBeTruthy();
    expect(isRestrictedSpecifier('@/selectors/buildInvestmentStrategy')).toBeTruthy();
    expect(isRestrictedSpecifier('@/services/apiClient')).toBeTruthy();
  });

  it('allows @shared/ paths (they resolve to shared/, not client/)', () => {
    expect(isRestrictedSpecifier('@shared/core/reserves/ReserveEngine')).toBeNull();
    expect(isRestrictedSpecifier('@shared/lib/fund-calc')).toBeNull();
    expect(isRestrictedSpecifier('@shared/utils/resilientLimit')).toBeNull();
    expect(isRestrictedSpecifier('@shared/instrumentation')).toBeNull();
  });

  it('allows relative server/worker internal imports', () => {
    expect(isRestrictedSpecifier('../storage')).toBeNull();
    expect(isRestrictedSpecifier('./middleware/idempotency')).toBeNull();
    expect(isRestrictedSpecifier('../lib/logger')).toBeNull();
  });

  it('allows node builtins and npm packages', () => {
    expect(isRestrictedSpecifier('node:path')).toBeNull();
    expect(isRestrictedSpecifier('express')).toBeNull();
    expect(isRestrictedSpecifier('bullmq')).toBeNull();
    expect(isRestrictedSpecifier('zod')).toBeNull();
  });
});

/**
 * Re-export completeness guard.
 *
 * Extracts named exports from shared source files and their client shims
 * using static analysis (same technique as the boundary guard). Catches
 * drift when shared/ adds a new export but the shim is not updated.
 */
const reExportPairs = [
  {
    source: 'shared/core/reserves/ReserveEngine.ts',
    shim: 'client/src/core/reserves/ReserveEngine.ts',
  },
  {
    source: 'shared/core/reserves/ConstrainedReserveEngine.ts',
    shim: 'client/src/core/reserves/ConstrainedReserveEngine.ts',
  },
  {
    source: 'shared/core/reserves/DeterministicReserveEngine.ts',
    shim: 'client/src/core/reserves/DeterministicReserveEngine.ts',
  },
  { source: 'shared/core/pacing/PacingEngine.ts', shim: 'client/src/core/pacing/PacingEngine.ts' },
  {
    source: 'shared/core/cohorts/CohortEngine.ts',
    shim: 'client/src/core/cohorts/CohortEngine.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/advanced-engine.ts',
    shim: 'client/src/core/cohorts/advanced-engine.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/resolvers.ts',
    shim: 'client/src/core/cohorts/resolvers.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/company-cohorts.ts',
    shim: 'client/src/core/cohorts/company-cohorts.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/cash-flows.ts',
    shim: 'client/src/core/cohorts/cash-flows.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/metrics.ts',
    shim: 'client/src/core/cohorts/metrics.ts',
  },
  {
    source: 'shared/core/liquidity/LiquidityEngine.ts',
    shim: 'client/src/core/LiquidityEngine.ts',
  },
  {
    source: 'shared/core/graduation/GraduationRateEngine.ts',
    shim: 'client/src/core/graduation/GraduationRateEngine.ts',
    allowedShimExtras: ['fromFundDataGraduationRates'],
  },
  {
    source: 'shared/core/capitalAllocation/CapitalAllocationEngine.ts',
    shim: 'client/src/core/capitalAllocation/CapitalAllocationEngine.ts',
  },
  { source: 'shared/lib/fund-calc.ts', shim: 'client/src/lib/fund-calc.ts' },
  { source: 'shared/utils/resilientLimit.ts', shim: 'client/src/utils/resilientLimit.ts' },
  { source: 'shared/utils/pLimit.ts', shim: 'client/src/utils/pLimit.ts' },
] as const;

const namedExportPattern = /export\s+(?:function|const|class|enum)\s+(\w+)/g;
const reExportPattern = /export\s+(?:type\s+)?\{\s*([^}]+)\}/g;
const exportAllPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
const typeExportPattern = /export\s+(?:type|interface)\s+(\w+)/g;
const defaultExportPattern = /export\s+default\s+function\s+(\w+)/g;
const reExportDefaultPattern = /export\s+\{\s*default\s*\}/g;

function resolveImportSpecifier(fromPath: string, specifier: string): string | null {
  if (specifier.startsWith('@shared/')) {
    return path.resolve(process.cwd(), specifier.replace('@shared/', 'shared/'));
  }
  if (specifier.startsWith('@/')) {
    return path.resolve(process.cwd(), specifier.replace('@/', 'client/src/'));
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(fromPath), specifier);
  }

  return null;
}

async function resolveSourceFile(candidatePath: string): Promise<string | null> {
  const extensions = path.extname(candidatePath) ? [''] : ['.ts', '.tsx', '.js', '.jsx'];

  for (const extension of extensions) {
    const absolutePath = `${candidatePath}${extension}`;
    try {
      await access(absolutePath);
      return absolutePath;
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function getExportedNames(
  relativePath: string,
  visited = new Set<string>()
): Promise<string[]> {
  const absolutePath = await resolveSourceFile(path.resolve(process.cwd(), relativePath));
  if (!absolutePath) {
    throw new Error(`Could not resolve source file for ${relativePath}`);
  }
  if (visited.has(absolutePath)) {
    return [];
  }
  visited.add(absolutePath);
  const source = await readFile(absolutePath, 'utf8');
  const names = new Set<string>();

  for (const match of source.matchAll(namedExportPattern)) {
    names.add(match[1]!);
  }
  for (const match of source.matchAll(typeExportPattern)) {
    names.add(match[1]!);
  }
  for (const match of source.matchAll(reExportPattern)) {
    for (const name of match[1]!.split(',')) {
      const trimmed = name
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()!
        .trim();
      if (trimmed) names.add(trimmed);
    }
  }
  // default exports: both `export default function foo` and `export { default }`
  for (const _match of source.matchAll(defaultExportPattern)) {
    names.add('default');
  }
  for (const _match of source.matchAll(reExportDefaultPattern)) {
    names.add('default');
  }
  for (const match of source.matchAll(exportAllPattern)) {
    const specifier = match[1]!;
    const target = resolveImportSpecifier(absolutePath, specifier);
    if (!target) continue;

    const relativeTarget = path.relative(process.cwd(), target).replace(/\\/g, '/');
    const targetExports = await getExportedNames(relativeTarget, visited);
    for (const exportName of targetExports) {
      if (exportName !== 'default') {
        names.add(exportName);
      }
    }
  }

  return [...names].sort();
}

describe('re-export completeness guard', () => {
  it.each(reExportPairs)(
    '$source shim forwards all public exports',
    async ({ source, shim, allowedShimExtras = [] }) => {
      const sourceExports = await getExportedNames(source);
      const shimExports = await getExportedNames(shim);
      const filteredShimExports = shimExports.filter((name) => !allowedShimExtras.includes(name));

      expect(filteredShimExports).toEqual(sourceExports);
    }
  );
});
