import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const repositoryRoot = process.cwd();
const policyPath = 'docs/governance/solo-internal-change-and-production-policy.md';
const canonicalGuidePath = 'docs/workflows/PRODUCTION_SCRIPTS.md';
const activePointerLanguage =
  'The canonical route is active for repository governance only; it confers no production readiness or authorization, and action-specific UNKNOWN prerequisites remain blocking.';

const knownReconciledGuides = [
  'PRODUCTION_RUNBOOK.md',
  'runbooks/release-checklist.md',
  'docs/DEPLOYMENT.md',
  'docs/PRODUCTION_CHECKLIST.md',
  'scripts/DEPLOYMENT_AUTOMATION_README.md',
  'scripts/README.md',
  'docs/deployment/vercel-setup.md',
  'docs/deployment/STAGING_CHECKLIST.md',
  'docs/deployment/ROLLBACK_PLAN.md',
  'docs/runbooks/rollback.md',
  'docs/runbooks/incident.md',
  'docs/runbooks/dr.md',
  'docs/runbooks/canary.md',
  'docs/runbooks/blue-green.md',
  'docs/runbooks/stage-normalization-migration.md',
  'docs/runbooks/stage-normalization-rollout.md',
  'docs/runbooks/stage-validation.md',
  'docs/runbooks/synthetic-monitoring.md',
  'docs/rollback-playbook.md',
  'docs/ROLLBACK_TRIGGERS.md',
  'docs/lp-deployment-checklist.md',
  'docs/SCENARIO_DEPLOY_GUIDE.md',
  'docs/deployment/CODEX-FIXES-DEPLOYMENT-STATUS.md',
  'docs/deployment/STAGING_METRICS.md',
  'docs/processes/DEPLOYMENT_COMPLETE.md',
  'docs/processes/DEPLOYMENT_TODO.md',
  'docs/plans/scenario-release-lane.md',
  'docs/validation/stage-validation-v3.md',
  'runbooks/canary-plan.md',
  'scripts/setup-gcp.md',
  'docs/ROLLOUT_STRATEGY.md',
  'docs/validation/stage-validation-patched.md',
  'cheatsheets/lp-deployment-quick-reference.md',
  'docs/chaos-engineering/RLS-GAME-DAY-RUNBOOK.md',
  'docs/METRICS_OPERATOR_RUNBOOK.md',
];

const archiveGatePreservedGuides = new Set([
  'docs/deployment/CODEX-FIXES-DEPLOYMENT-STATUS.md',
  'docs/processes/DEPLOYMENT_COMPLETE.md',
  'docs/processes/DEPLOYMENT_TODO.md',
  'docs/validation/stage-validation-v3.md',
]);

async function readRepositoryFile(relativePath: string): Promise<string> {
  const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

  return actualFs.readFileSync(join(repositoryRoot, relativePath), 'utf8');
}

async function repositoryFileExists(relativePath: string): Promise<boolean> {
  const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

  return actualFs.existsSync(join(repositoryRoot, relativePath));
}

describe('production governance documentation routing', () => {
  it('separates source admission, immutable certification, and production authority', async () => {
    const policy = await readRepositoryFile(policyPath);
    const canonicalGuide = await readRepositoryFile(canonicalGuidePath);
    const decisions = await readRepositoryFile('DECISIONS.md');

    expect(policy).toMatch(/conditional and independently applicable/i);
    expect(policy).toMatch(/immutable evidence.*historically valid/i);
    expect(policy).toMatch(/current-action eligibility/i);
    expect(policy).toMatch(/production-coupled merge/i);
    expect(canonicalGuide).toMatch(
      /one final.*currentness.*immediately before.*first production mutation/i
    );
    expect(canonicalGuide).toMatch(/retry once.*BLOCKED/i);
    expect(canonicalGuide).toMatch(/historical receipts/i);
    expect(decisions).toContain('## ADR-083: Proportional Release Governance');
    expect(decisions).toMatch(/no authority/i);
  });

  it('ratifies policy and ADR for repository governance without production authority', async () => {
    const policy = await readRepositoryFile(policyPath);
    const decisions = await readRepositoryFile('DECISIONS.md');

    expect(policy).toContain('status: ACTIVE');
    expect(policy).toContain('active repository-governance authority');
    expect(policy).toContain('does not self-activate');
    expect(policy).toMatch(/nor\s+establishes production readiness/);
    expect(policy).toContain('Merge authorizes source admission only');
    expect(policy).toContain('CI Gate Status');
    expect(policy).toMatch(
      /owner note, review, receipt, or action record cannot override a machine\s+failure/
    );
    expect(policy).toMatch(
      /\|\s*Owner note\s*\|\s*Accountability and explicit intent; not correctness proof or independent approval\.\s*\|/
    );
    expect(policy).toMatch(
      /\|\s*Review\s*\|\s*Defect-finding observation; not independent approval or authority\.\s*\|/
    );
    expect(policy).toMatch(
      /\|\s*Receipt\s*\|\s*Action\/result record; neither preventive control nor authorization\.\s*\|/
    );
    expect(policy).toMatch(
      /\|\s*Action record\s*\|\s*Bounded record; neither authorization nor a machine-failure override\.\s*\|/
    );
    expect(policy).not.toContain('## Observed provider facts and limits');
    expect(policy).toContain('## Consequence-specific proof');
    expect(policy).toContain('scripts/ci/classify-change-paths.mjs');
    expect(policy).toContain('financial-truth');
    expect(policy).toContain('npm run phoenix:truth');
    expect(policy).toMatch(/missing or malformed\s+classification\s+fails the aggregate/i);
    expect(policy).toContain('named expected-output/truth assertion');
    expect(policy).toContain('Denial test plus zero mutation/zero leak assertion');
    expect(policy).toContain('Retry/duplicate-harm control, concurrency control');
    expect(policy).toContain('real-database or production-equivalent test');
    expect(policy).toContain('Duplicate-safe behavior, timeout/bounds, failure semantics');
    expect(policy).toContain('ADR-079');
    expect(policy).toMatch(/branch-protection writer is retired/);
    expect(policy).toMatch(/static reachability proof/);
    expect(policy).toMatch(/Steps\s+4–7/);
    expect(policy).toContain('action-specific UNKNOWNs');
    expect(policy).not.toMatch(/remains blocked pending|pending Step 3 closure/i);
    expect(decisions).toContain('## ADR-081: Minimum Governance Adoption Boundaries');
    expect(decisions).toContain('**Status:** Accepted');
    expect(decisions).toContain('Adopt one concise policy');
    expect(decisions).toMatch(/repository-adoption closure is not production readiness/i);
    expect(decisions).toContain('### Alternatives');
    expect(decisions).toContain('### Supersession');
    expect(decisions).toContain('### Accepted risks');
    expect(decisions).toContain('### Rollback');
    expect(decisions).toContain('### Revisit triggers');
    expect(decisions).toContain('Option A');
    expect(decisions).toContain('force-push risk');
    expect(decisions).toMatch(/branch-protection writer is retired/);
    expect(decisions).toMatch(/action-specific provider, schema, and recovery\s+evidence/i);
    expect(decisions).not.toMatch(/remain proposed\/draft|remain incomplete/);
    expect(decisions).toMatch(
      /Never use force push, down migration, provider mutation, or branch-policy\s+overwrite/
    );
  });

  it('routes production actions only through guarded canonical procedure', async () => {
    const canonicalGuide = await readRepositoryFile(canonicalGuidePath);

    expect(canonicalGuide).toContain('status: ACTIVE');
    expect(canonicalGuide).toContain('active solely as canonical repository routing and procedure');
    expect(canonicalGuide).toMatch(
      /ACTIVE is not executable-entrypoint proof, production readiness, or production\s+authorization/
    );
    expect(canonicalGuide).toMatch(/Current UNKNOWN prerequisites block their\s+applicable action/);
    expect(canonicalGuide).toContain('zero mutation dispatch');
    expect(canonicalGuide).toMatch(/branch-protection writer is retired/);
    expect(canonicalGuide).toMatch(/static\s+reachability proof/);
    expect(canonicalGuide).toMatch(
      /current targeted order proof or action evidence is absent,\s+stale, or mismatched/
    );
    expect(canonicalGuide).not.toMatch(/pending Step 3 closure|hosted exact-head CI/i);
    expect(canonicalGuide).not.toContain('known repository candidates');
    expect(canonicalGuide).toContain('refreshed exact SHA');
    expect(canonicalGuide).toContain('provider scope');
    expect(canonicalGuide).toContain('existing target identity');
    expect(canonicalGuide).toMatch(/exact\s+returned target ID/);
    expect(canonicalGuide).toContain('restore-reference revalidation');
    expect(canonicalGuide).toContain('managed backup/PITR');
    expect(canonicalGuide).toContain('isolated restore freshness');
    expect(canonicalGuide).toContain('custody roles');
    expect(canonicalGuide).toContain('preview/restore isolation');
    expect(canonicalGuide).toContain('ADR-079');
    expect(canonicalGuide).toContain('Phoenix truth');
    expect(canonicalGuide).toContain('Phoenix protected paths');
    expect(canonicalGuide).toContain('idempotency');
    expect(canonicalGuide).toContain('optimistic locking');
    expect(canonicalGuide).toContain('promotion hard stop');
    expect(canonicalGuide).toContain('2026-08-14');
    expect(canonicalGuide).toContain('read-only revalidation at the exact candidate');
    expect(canonicalGuide).toContain('may drift and remains non-authorizing');
    expect(await repositoryFileExists('.github/workflows/release-production.yml')).toBe(true);
    expect(await repositoryFileExists('scripts/deploy-production.ps1')).toBe(true);
    expect(await repositoryFileExists('scripts/rollback-verify.sh')).toBe(true);
  });

  it('keeps index deployment and scripts routing non-authorizing', async () => {
    const index = await readRepositoryFile('docs/INDEX.md');
    const quickNavigation = index.slice(
      index.indexOf('## Quick Navigation'),
      index.indexOf('## Getting Started')
    );
    const scriptsSection = index.slice(
      index.indexOf('## Scripts'),
      index.indexOf('## Phoenix Project')
    );

    expect(quickNavigation).toMatch(
      /\| \[Deployment\]\(#deployment\)\s+\| Deploying to staging\/production\s+\| workflows\/PRODUCTION_SCRIPTS\.md\s+\|/
    );
    expect(scriptsSection).toMatch(
      /\[scripts\/README\.md\].*Non-authorizing production-action pointer.*Script orientation/
    );
    expect(scriptsSection).not.toMatch(
      /\[scripts\/README\.md\].*Deployment scripts documentation.*Deployment automation/
    );
    const deploymentSection = index.slice(
      index.indexOf('## Deployment'),
      index.indexOf('## Architecture')
    );

    expect(deploymentSection).not.toContain('scripts/deploy-with-confidence.ps1');
    expect(deploymentSection).not.toContain('/deploy-check');
    expect(deploymentSection).toContain('docs/workflows/PRODUCTION_SCRIPTS.md');
    expect(deploymentSection).toContain('non-authorizing');
  });

  it('retires deploy and schema command routes as production authority', async () => {
    const discoveryMap = await readRepositoryFile('.claude/DISCOVERY-MAP.md');
    const commandPaths = ['.claude/commands/deploy-check.md', '.claude/commands/db-validate.md'];

    expect(discoveryMap).toMatch(
      /"db validate" OR "schema check" OR "before db:push"\s+\| docs\/workflows\/PRODUCTION_SCRIPTS\.md/
    );
    expect(discoveryMap).toContain('Non-authorizing pointer');

    for (const commandPath of commandPaths) {
      const command = await readRepositoryFile(commandPath);

      expect(command, commandPath).toContain('docs/workflows/PRODUCTION_SCRIPTS.md');
      expect(command, commandPath).toContain(
        'Current UNKNOWN prerequisites block their applicable action'
      );
      expect(command, commandPath).toContain('refreshed exact SHA');
      expect(command, commandPath).toContain('target scope');
      expect(command, commandPath).toMatch(/recovery\s+evidence/);
      expect(command, commandPath).toMatch(/evidence\s+gates/);
      expect(command, commandPath).toMatch(/branch-protection\s+writer is retired/);
      expect(command, commandPath).toContain('canonical repository-governance route');
      expect(command, commandPath).not.toMatch(
        /DRAFT|final exact-head\s+production-mutation corpus closure|hosted exact-head CI/i
      );
      expect(command, commandPath).not.toMatch(/Safe to (proceed|run)|--force/i);
    }
  });

  it('makes the known reconciled guide set non-authorizing before mutations', async () => {
    for (const guidePath of knownReconciledGuides) {
      const guide = await readRepositoryFile(guidePath);

      const historicalMarker = '\n## Preserved historical content\n';
      const historicalMarkerIndex = guide.indexOf(historicalMarker);
      const currentAuthoritySurface =
        historicalMarkerIndex === -1 ? guide : guide.slice(0, historicalMarkerIndex);

      expect(guide, guidePath).toContain('Canonical production-action authority');
      expect(guide, guidePath).toContain('docs/workflows/PRODUCTION_SCRIPTS.md');
      expect(guide, guidePath).toContain('confers no authority');
      expect(guide.replaceAll('\n', ' '), guidePath).toContain(activePointerLanguage);
      expect(guide, guidePath).not.toMatch(/remains draft pending Step 3 closure/i);
      expect(currentAuthoritySurface, guidePath).not.toMatch(
        /vercel --prod|deploy-production\.yml|gcloud |npm run db:push|--force|psql |create table|alter table|drop table/i
      );

      if (archiveGatePreservedGuides.has(guidePath)) {
        expect(historicalMarkerIndex, guidePath).toBeGreaterThan(0);
        expect(guide.slice(historicalMarkerIndex), guidePath).toContain(
          'retained for Archive Gate and provenance only'
        );
      } else {
        expect(historicalMarkerIndex, guidePath).toBe(-1);
      }
    }
  });
});

const entryLoaderPaths = ['CLAUDE.md', 'AGENTS.md'];

// Matching happens on whitespace-flattened text so Prettier re-wrapping never
// breaks a pin.
const flattenWhitespace = (text: string): string =>
  text.replaceAll(/\n>\s?/g, '\n').replaceAll(/\s+/g, ' ');

const sharedGovernanceBlockStrings = [
  '**Governing policy:** `docs/governance/solo-internal-change-and-production-policy.md`',
  'resolve it from `origin/main` (the protected target branch), never from a working branch',
  'read it before any merge, production, archive, or governance action',
  'All mutations MUST have idempotency',
  'All updates MUST use optimistic locking',
  'All cursors MUST be validated',
  'All queue jobs MUST have timeouts',
  'BEFORE changing shared test mocks or fixtures, grep for ALL assertion patterns',
  'BEFORE declaring a file, plan, or branch missing, search all worktrees',
];

// Plans authored before the document-roles-and-precedence adoption; every plan
// added after it must route to the governing policy.
const legacyPlanDocs = new Set([
  'F_1.0.0_activation-blockers-runtime.plan.md',
  'F_1.1.0_wave-h-context-rail-decisions.plan.md',
  'F_1.2.0_v1.4-release-proof-activation.plan.md',
  'F_1.2.4_ws2-transaction-audit-repair.plan.md',
  'F_1.2.5_g3-foundations-landing.plan.md',
  'F_1.3.0_fee-economics-convergence.plan.md',
  'F_1.4.0_post-activation-epics.plan.md',
]);

describe('governance document hierarchy', () => {
  it('keeps both entry loaders routing to the governing policy', async () => {
    for (const loaderPath of entryLoaderPaths) {
      const loader = await readRepositoryFile(loaderPath);
      const flatLoader = flattenWhitespace(loader);

      expect(loader, loaderPath).toContain(policyPath);
      for (const pinned of sharedGovernanceBlockStrings) {
        expect(flatLoader, loaderPath).toContain(pinned);
      }

      const lineCount = loader.split('\n').length;
      expect(lineCount, `${loaderPath} must stay a short entry loader`).toBeLessThan(160);
    }
  });

  it('pins the constitution sections that bind precedence', async () => {
    const policy = await readRepositoryFile(policyPath);
    const flatPolicy = flattenWhitespace(policy);

    expect(policy).toContain('## Document roles and precedence');
    expect(flatPolicy).toContain('this policy prevails');
    expect(flatPolicy).toContain('fails closed');
    expect(flatPolicy).toContain('amends only by a pull request that modifies this file');
    expect(flatPolicy).toContain('is procedure or reference at most and can never grant authority');
    expect(flatPolicy).toContain(
      'the sole issuer of action-scoped production authority is the repository owner'
    );
    expect(policy).toContain('tests/unit/audit/surface-contract-matrix.test.ts');
    expect(flatPolicy).toContain('it is not generic merge or release approval');
    expect(policy).toContain('## Documentation governance');
    expect(policy).toContain('Archive Gate');
    expect(policy).toContain('.claude/PHOENIX-AGENTS-REGISTRY.md');
  });

  it('keeps the matrix program plans scoped below the policy', async () => {
    for (const planPath of [
      'docs/1-plans/F_1.2.1_ws1-surface-contract-matrix.plan.md',
      'docs/1-plans/F_1.2.2_g1-matrix-repair.plan.md',
    ]) {
      const plan = await readRepositoryFile(planPath);
      const flatPlan = flattenWhitespace(plan);

      expect(flatPlan, planPath).toContain(
        'G1 in this document is artifact-scoped to this matrix program'
      );
      expect(flatPlan, planPath).toContain('it is not generic merge or release approval');
      expect(plan, planPath).toContain(policyPath);
    }
  });

  it('keeps the capture-release-baseline workflow generic and non-authorizing', async () => {
    const workflow = await readRepositoryFile('.github/workflows/capture-release-baseline.yml');

    expect(workflow).toContain('bounded pre-merge provider baseline');
    expect(workflow).toContain('pr_number');
    expect(workflow).toContain('plan_path');
    expect(workflow).toContain('Execution confers no');
    expect(workflow).toContain('authorization; output remains evidence');
    expect(workflow).not.toContain('PR #1385');
  });

  it('requires new plan documents to route to the governing policy', async () => {
    const { execFileSync } =
      await vi.importActual<typeof import('node:child_process')>('node:child_process');
    const tracked = execFileSync('git', ['ls-files', 'docs/1-plans/'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    const planDocs = tracked
      .trim()
      .split('\n')
      .map((p) => p.replace('docs/1-plans/', ''))
      .filter((name) => name.endsWith('.plan.md'))
      .sort();

    for (const name of planDocs) {
      if (legacyPlanDocs.has(name)) continue;
      const plan = await readRepositoryFile(join('docs/1-plans', name));

      expect(plan, `${name} must reference the governing policy`).toContain(policyPath);
    }
  });
});
