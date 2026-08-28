import { spawnSync } from 'node:child_process';
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { isFinancialPath } from '../../scripts/ci/classify-change-paths.mjs';

const CHANGE_CLASSIFIER = path.join(process.cwd(), 'scripts', 'ci', 'classify-change-paths.mjs');

type ChangeClassification = {
  autoDocsOnly: boolean;
  changeCount: number;
  financialCalcRelevant: boolean;
  heavyCiRelevant: boolean;
  valid: boolean;
};

const OLD_OBJECT = '1'.repeat(40);
const NEW_OBJECT = '2'.repeat(40);
const ZERO_OBJECT = '0'.repeat(40);
const MIXED_FINANCIAL_ROOTS = [
  'server/services',
  'shared/lib',
  'client/src/lib',
  'shared/schemas',
  'shared/contracts',
] as const;
const FINANCIAL_KEYWORDS =
  /(calc|fee|nav|xirr|moic|irr|waterfall|reserve|forecast|economic|payout|distribution|carry|scenario|sensitivity|metrics-engine)/i;

function rawChange(
  status: string,
  paths: readonly string[],
  oldMode = '100644',
  newMode = '100644'
): string[] {
  const oldObject = oldMode === '000000' ? ZERO_OBJECT : OLD_OBJECT;
  const newObject = newMode === '000000' ? ZERO_OBJECT : NEW_OBJECT;
  return [`:${oldMode} ${newMode} ${oldObject} ${newObject} ${status}`, ...paths];
}

function sourceFilesUnder(root: string, actualFs: typeof import('node:fs')): string[] {
  return actualFs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(entryPath, actualFs);
    return /\.(?:js|mjs|cjs|ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function classifyRawDiff(tokens: readonly string[]): {
  result: ChangeClassification | null;
  status: number | null;
  stderr: string;
} {
  const input = tokens.length === 0 ? Buffer.alloc(0) : Buffer.from(`${tokens.join('\0')}\0`);
  const completed = spawnSync(
    process.execPath,
    [CHANGE_CLASSIFIER, '--stdin', '--filters', '.github/path-filters.yml'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input,
    }
  );

  let result: ChangeClassification | null = null;
  if (completed.stdout.trim().length > 0) {
    result = JSON.parse(completed.stdout) as ChangeClassification;
  }

  return {
    result,
    status: completed.status,
    stderr: completed.stderr,
  };
}

describe('CI fail-closed change classification', () => {
  const lightPaths = [
    'docs/_generated/router-index.json',
    'docs/_generated/router-fast.json',
    'docs/_generated/staleness-report.md',
    'docs/skills/SKILLS_INDEX.md',
    'docs/skills/WIZARD_INDEX.md',
  ] as const;

  it('allows each reviewed generated output and all five together', () => {
    for (const lightPath of lightPaths) {
      const classified = classifyRawDiff(rawChange('M', [lightPath]));
      expect(classified.status, classified.stderr).toBe(0);
      expect(classified.result).toEqual({
        autoDocsOnly: true,
        changeCount: 1,
        financialCalcRelevant: false,
        heavyCiRelevant: false,
        valid: true,
      });
    }

    const classified = classifyRawDiff(
      lightPaths.flatMap((lightPath) => rawChange('M', [lightPath]))
    );
    expect(classified.status, classified.stderr).toBe(0);
    expect(classified.result).toEqual({
      autoDocsOnly: true,
      changeCount: 5,
      financialCalcRelevant: false,
      heavyCiRelevant: false,
      valid: true,
    });
  });

  it.each([
    ['unknown path', rawChange('A', ['unknown/new-tool.bin'], '000000', '100644')],
    [
      'mixed paths',
      [
        ...rawChange('M', ['docs/_generated/router-index.json']),
        ...rawChange('M', ['docs/governance-policy.md']),
      ],
    ],
    [
      'rename into allowlist',
      rawChange('R100', ['docs/legacy-router.json', 'docs/_generated/router-index.json']),
    ],
    [
      'rename out of allowlist',
      rawChange('R100', ['docs/_generated/router-index.json', 'docs/legacy-router.json']),
    ],
    ['deleted executable', rawChange('D', ['scripts/release/deploy.mjs'], '100755', '000000')],
    [
      'allowlisted executable-bit change',
      rawChange('M', ['docs/_generated/router-index.json'], '100644', '100755'),
    ],
    [
      'allowlisted type change',
      rawChange('T', ['docs/_generated/router-index.json'], '100644', '120000'),
    ],
    ['allowlisted unmerged status', rawChange('U', ['docs/_generated/router-index.json'])],
  ] as const)('routes %s to heavy CI', (_caseName, tokens) => {
    const classified = classifyRawDiff(tokens);
    expect(classified.status, classified.stderr).toBe(0);
    expect(classified.result).toMatchObject({
      autoDocsOnly: false,
      heavyCiRelevant: true,
      valid: true,
    });
  });

  it('keeps an allowlisted delete and an internal allowlist rename light', () => {
    const deleted = classifyRawDiff(
      rawChange('D', ['docs/skills/SKILLS_INDEX.md'], '100644', '000000')
    );
    expect(deleted.status, deleted.stderr).toBe(0);
    expect(deleted.result).toMatchObject({ autoDocsOnly: true, heavyCiRelevant: false });

    const renamed = classifyRawDiff(
      rawChange('R100', ['docs/_generated/router-fast.json', 'docs/_generated/router-index.json'])
    );
    expect(renamed.status, renamed.stderr).toBe(0);
    expect(renamed.result).toMatchObject({ autoDocsOnly: true, heavyCiRelevant: false });
  });

  it.each([
    ['empty input', []],
    ['missing rename destination', rawChange('R100', ['docs/_generated/router-index.json'])],
    ['unknown status', rawChange('Z', ['docs/_generated/router-index.json'])],
    [
      'malformed rename score',
      rawChange('R101', ['docs/_generated/router-fast.json', 'docs/_generated/router-index.json']),
    ],
    ['missing raw header', ['M', 'docs/_generated/router-index.json']],
  ] as const)('rejects malformed producer input: %s', (_caseName, tokens) => {
    const classified = classifyRawDiff(tokens);
    expect(classified.status).not.toBe(0);
    expect(classified.result).toBeNull();
    expect(classified.stderr).toMatch(/change classification failed/i);
  });
});

describe('Financial calculation change classification', () => {
  it.each([
    'server/engine/fee-calculator.ts',
    'server/core/nav.ts',
    'shared/core/fund-math.ts',
    'client/src/engines/pacing.ts',
    'client/src/core/reserves.ts',
    'server/services/new-calculator.ts',
    'client/src/lib/new-finance.ts',
    'shared/schemas/new-financial-contract.ts',
    'shared/lib/finance/xirr.ts',
    'shared/lib/economics/fee-drag.ts',
    'shared/lib/internal-economics/carry.ts',
    'shared/lib/waterfall/american-ledger.ts',
    'shared/lib/fund-math.ts',
    'shared/lib/decimal-config.ts',
    'shared/lib/excelRound.ts',
    'shared/lib/fund-calc.ts',
    'shared/lib/decimal-utils.ts',
    'shared/lib/canonical-hash.ts',
    'shared/lib/reserves-v11.ts',
    'shared/contracts/current-forecast-v2.contract.ts',
    'shared/contracts/portfolio-meta.contract.ts',
    'shared/contracts/fund-actuals/fund-company-actuals-fact.contract.ts',
    'shared/contracts/dual-forecast/dual-forecast-response.contract.ts',
    'shared/contracts/allocations/allocation-actuals-drift-v1.contract.ts',
    'shared/contracts/scenarios/scenario-case-seed-v1.contract.ts',
    'shared/contracts/kpi/kpi-observation-v1.contract.ts',
    'shared/utils/scenario-math.ts',
    'scripts/golden/phoenix-truth.mjs',
    'server/lib/moic-mapper.ts',
    'client/src/adapters/reserves-adapter.ts',
    'docs/internal-economics-v2.truth-cases.json',
    'tests/unit/internal-economics/v2/support/legacy-corpus-adapter.ts',
    'tests/unit/truth-cases/internal-economics-v2-engine.test.ts',
  ])('flags %s as financial-calculation relevant', (changedPath) => {
    const classified = classifyRawDiff(rawChange('M', [changedPath]));
    expect(classified.status, classified.stderr).toBe(0);
    expect(classified.result).toMatchObject({ financialCalcRelevant: true });
  });

  it.each([
    'docs/governance/policy.md',
    'client/src/pages/dashboard.tsx',
    'client/src/components/chart.tsx',
    'server/routes.ts',
    'client/src/components/CapitalFirstCalculator.tsx',
  ])('does not flag %s as financial-calculation relevant', (changedPath) => {
    const classified = classifyRawDiff(rawChange('M', [changedPath]));
    expect(classified.status, classified.stderr).toBe(0);
    expect(classified.result).toMatchObject({ financialCalcRelevant: false });
  });

  it('keeps keyword-bearing mixed-root source files covered by the financial predicate', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const unflagged: string[] = [];
    const keywordFiles = MIXED_FINANCIAL_ROOTS.flatMap((root) =>
      sourceFilesUnder(root, actualFs)
    ).filter((file) => FINANCIAL_KEYWORDS.test(actualFs.readFileSync(file, 'utf8')));

    expect(keywordFiles.length).toBeGreaterThan(0);

    for (const file of keywordFiles) {
      if (!isFinancialPath(file)) unflagged.push(file);
    }

    expect(unflagged).toEqual([]);
  });

  it('runs the exact V2 proof command in Financial Truth', async () => {
    const workflowPath = path.join(process.cwd(), '.github/workflows/ci-unified.yml');
    const workflow = YAML.parse(await fs.readFile(workflowPath, 'utf-8'));
    const steps = workflow.jobs['financial-truth'].steps as Array<{ run?: string }>;

    expect(steps.some((step) => step.run === 'npm run test:internal-economics-v2')).toBe(true);
  });
});

describe('CI Workflow Regression - Fix #4', () => {
  describe('Separate jobs for base and PR builds (no race conditions)', () => {
    it('should use 3 separate jobs: build-base, build-pr, compare', async () => {
      // Original bug: Single job with multiple checkouts caused race conditions
      // Fix: Split into 3 jobs with artifact passing

      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Should have exactly 3 jobs
      expect(workflow.jobs).toBeDefined();
      expect(Object.keys(workflow.jobs)).toContain('build-base');
      expect(Object.keys(workflow.jobs)).toContain('build-pr');
      expect(Object.keys(workflow.jobs)).toContain('compare');

      // Verify compare job depends on both builds
      expect(workflow.jobs.compare.needs).toBeDefined();
      expect(workflow.jobs.compare.needs).toEqual(
        expect.arrayContaining(['build-base', 'build-pr'])
      );
    });

    it('should build base branch in isolated job (no contamination)', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const buildBase = workflow.jobs['build-base'];
      expect(buildBase).toBeDefined();

      // Should checkout base branch
      const checkoutStep = buildBase.steps.find(
        (step: any) => step.uses?.includes('actions/checkout') && step.with?.path === 'base-branch'
      );
      expect(checkoutStep).toBeDefined();
      expect(checkoutStep.with?.ref).toBe('${{ github.base_ref }}');

      // Should build
      const buildStep = buildBase.steps.find((step: any) => step.run?.includes('npm run build'));
      expect(buildStep).toBeDefined();

      // Should upload artifact (not write to workspace)
      const uploadStep = buildBase.steps.find((step: any) =>
        step.uses?.includes('actions/upload-artifact')
      );
      expect(uploadStep).toBeDefined();
    });

    it('should build PR branch in isolated job (no contamination)', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const buildPR = workflow.jobs['build-pr'];
      expect(buildPR).toBeDefined();

      // Should checkout PR branch (default)
      const checkoutStep = buildPR.steps.find((step: any) =>
        step.uses?.includes('actions/checkout')
      );
      expect(checkoutStep).toBeDefined();

      // Should build
      const buildStep = buildPR.steps.find((step: any) => step.run?.includes('npm run build'));
      expect(buildStep).toBeDefined();

      // Should upload artifact
      const uploadStep = buildPR.steps.find((step: any) =>
        step.uses?.includes('actions/upload-artifact')
      );
      expect(uploadStep).toBeDefined();
    });

    it('should compare results using artifacts (not file system)', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];
      expect(compare).toBeDefined();

      // Should download both artifacts
      const downloadSteps = compare.steps.filter((step: any) =>
        step.uses?.includes('actions/download-artifact')
      );
      expect(downloadSteps.length).toBeGreaterThanOrEqual(2);

      // Should have download for base results
      const baseDownload = downloadSteps.find((step: any) => step.with?.name?.includes('base'));
      expect(baseDownload).toBeDefined();

      // Should have download for PR results
      const prDownload = downloadSteps.find((step: any) => step.with?.name?.includes('pr'));
      expect(prDownload).toBeDefined();
    });
  });

  describe('Artifacts for size comparison (no file race conditions)', () => {
    it('should upload artifacts in build jobs', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Base job should upload
      const buildBase = workflow.jobs['build-base'];
      const baseUpload = buildBase.steps.find((step: any) =>
        step.uses?.includes('actions/upload-artifact@v7')
      );
      expect(baseUpload).toBeDefined();
      expect(baseUpload.with?.name).toBeDefined();

      // PR job should upload
      const buildPR = workflow.jobs['build-pr'];
      const prUpload = buildPR.steps.find((step: any) =>
        step.uses?.includes('actions/upload-artifact@v7')
      );
      expect(prUpload).toBeDefined();
      expect(prUpload.with?.name).toBeDefined();
    });

    it('should download artifacts in compare job', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Should download artifacts
      const downloads = compare.steps.filter((step: any) =>
        step.uses?.includes('actions/download-artifact@v8')
      );
      expect(downloads.length).toBeGreaterThanOrEqual(2);
    });

    it('should NOT have multiple checkout cycles in compare job', async () => {
      // Original bug: Multiple checkouts in same job caused file race conditions
      // Fix: Compare job only checks out once for scripts

      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Count checkout actions
      const checkouts = compare.steps.filter((step: any) =>
        step.uses?.includes('actions/checkout')
      );

      // Should only checkout once (for comparison script)
      expect(checkouts.length).toBeLessThanOrEqual(1);
    });

    it('should NOT switch branches in compare job', async () => {
      // Original bug: git checkout commands caused workspace corruption
      // Fix: No git checkout in compare job

      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Check all run steps for git checkout commands
      const runSteps = compare.steps.filter((step: any) => step.run);

      for (const step of runSteps) {
        const runContent = step.run as string;

        // Should NOT have git checkout (except in checkout action itself)
        if (!step.uses?.includes('actions/checkout')) {
          expect(runContent).not.toMatch(/git\s+checkout/i);
        }
      }
    });
  });

  describe('Race condition prevention', () => {
    it('should prevent file overwrites by using separate workspaces', async () => {
      // Each job gets its own runner/workspace, preventing overwrites

      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Each job should be independent (no shared state)
      const buildBase = workflow.jobs['build-base'];
      const buildPR = workflow.jobs['build-pr'];
      const compare = workflow.jobs['compare'];

      // Build jobs should not depend on each other
      expect(buildBase.needs).toBeUndefined();
      expect(buildPR.needs).toBeUndefined();

      // Only compare depends on builds
      expect(compare.needs).toEqual(['build-base', 'build-pr']);
    });

    it('should use artifacts to pass data between jobs (not files)', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Upload in build jobs
      expect(
        workflow.jobs['build-base'].steps.some((s: any) => s.uses?.includes('upload-artifact'))
      ).toBe(true);

      expect(
        workflow.jobs['build-pr'].steps.some((s: any) => s.uses?.includes('upload-artifact'))
      ).toBe(true);

      // Download in compare job
      expect(
        workflow.jobs['compare'].steps.some((s: any) => s.uses?.includes('download-artifact'))
      ).toBe(true);
    });

    it('should have proper artifact naming (no conflicts)', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Get artifact names
      const baseUpload = workflow.jobs['build-base'].steps.find((s: any) =>
        s.uses?.includes('upload-artifact')
      );
      const prUpload = workflow.jobs['build-pr'].steps.find((s: any) =>
        s.uses?.includes('upload-artifact')
      );

      // Artifact names should be different
      expect(baseUpload.with?.name).toBeDefined();
      expect(prUpload.with?.name).toBeDefined();
      expect(baseUpload.with?.name).not.toBe(prUpload.with?.name);
    });
  });

  describe('Job isolation and data flow', () => {
    it('should run build-base and build-pr in parallel (no dependencies)', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Build jobs should not depend on each other (parallel execution)
      expect(workflow.jobs['build-base'].needs).toBeUndefined();
      expect(workflow.jobs['build-pr'].needs).toBeUndefined();
    });

    it('should run compare only after both builds complete', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Compare must wait for both
      expect(workflow.jobs['compare'].needs).toBeDefined();
      expect(workflow.jobs['compare'].needs).toHaveLength(2);
      expect(workflow.jobs['compare'].needs).toContain('build-base');
      expect(workflow.jobs['compare'].needs).toContain('build-pr');
    });

    it('should use consistent Node.js version across all jobs', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const jobs = ['build-base', 'build-pr', 'compare'];
      const configuredVersions: string[] = [];

      for (const jobName of jobs) {
        const job = workflow.jobs[jobName];
        const nodeSetup = job.steps.find((s: any) => s.uses?.includes('actions/setup-node'));

        if (nodeSetup?.with?.['node-version']) {
          configuredVersions.push(String(nodeSetup.with['node-version']));
        }
      }

      expect(configuredVersions.length).toBeGreaterThan(0);
      expect(new Set(configuredVersions).size).toBe(1);
      expect(configuredVersions[0]).toMatch(/^22(\.|$)/);
    });
  });

  describe('Regression: Specific race condition patterns', () => {
    it('should not write results to same filename in workspace', async () => {
      // Original bug: Both branches wrote to size-limit-current.json
      // causing overwrites and race conditions
      // Fix: Use artifacts with separate names

      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Compare job should download artifacts to different paths
      const downloads = compare.steps.filter((s: any) => s.uses?.includes('download-artifact'));

      // Each download should specify a different path
      const paths = downloads.map((d: any) => d.with?.path).filter(Boolean);

      // All paths should be unique
      expect(new Set(paths).size).toBe(paths.length);
    });

    it('should handle artifact path correctly in comparison script', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Find the comparison step
      const compareStep = compare.steps.find(
        (s: any) => s.name?.includes('Compare') || s.run?.includes('compare')
      );

      if (compareStep) {
        const runContent = compareStep.run as string;

        // Should move or reference artifact files correctly
        expect(runContent).toMatch(/size-limit|bundle/i);
      }
    });

    it('should fail workflow if bundle size exceeds limits', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Should have a step that fails on limit exceeded
      const failStep = compare.steps.find(
        (s: any) => s.name?.includes('Fail') || s.run?.includes('exit 1')
      );

      expect(failStep).toBeDefined();
    });
  });

  describe('Workflow configuration validation', () => {
    it('should trigger on correct branches', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      expect(workflow.on.pull_request).toBeDefined();
      expect(workflow.on.pull_request.branches).toContain('main');
    });

    it('should trigger on relevant file changes only', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      expect(workflow.on.pull_request.paths).toBeDefined();
      expect(workflow.on.pull_request.paths).toContain('client/**');
      expect(workflow.on.pull_request.paths).toContain('vite.config.ts');
    });

    it('should use actions/upload-artifact@v7 and actions/download-artifact@v8', async () => {
      const workflowPath = path.join(process.cwd(), '.github/workflows/bundle-size-check.yml');

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');

      // Artifact action majors intentionally follow the current workflow versions.
      expect(workflowContent).toMatch(/actions\/upload-artifact@v7/);
      expect(workflowContent).toMatch(/actions\/download-artifact@v8/);
    });
  });
});

describe('CI e2e smoke: no test-failure masking (Task 6)', () => {
  const workflowPath = path.join(process.cwd(), '.github/workflows/ci-unified.yml');

  it('does not mask a smoke test failure with an unconditional fallback', async () => {
    const content = await fs.readFile(workflowPath, 'utf-8');
    // The naive "A || B" retries via a different harness and can green a real
    // test failure. It must be gone.
    expect(content).not.toContain('npm run test:e2e:smoke || npm run test:smoke');
  });

  it('gates the fallback behind a selector/preflight probe', async () => {
    const content = await fs.readFile(workflowPath, 'utf-8');
    // Preflight probe decides whether the smoke project is runnable here; only
    // then does the real run happen, and its failure propagates.
    expect(content).toContain('test:e2e:smoke -- --list');
    // The self-contained fallback stays available for preflight failures.
    expect(content).toContain('npm run test:smoke');
  });
});
