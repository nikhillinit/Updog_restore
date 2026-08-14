import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const repositoryRoot = process.cwd();
const policyPath = 'docs/governance/solo-internal-change-and-production-policy.md';
const canonicalGuidePath = 'docs/workflows/PRODUCTION_SCRIPTS.md';

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
  it('keeps policy and ADR preparation explicitly draft after writer retirement', async () => {
    const policy = await readRepositoryFile(policyPath);
    const decisions = await readRepositoryFile('DECISIONS.md');

    expect(policy).toContain('status: DRAFT');
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
    expect(policy).toContain('named expected-output/truth assertion');
    expect(policy).toContain('Denial test plus zero mutation/zero leak assertion');
    expect(policy).toContain('Retry/duplicate-harm control, concurrency control');
    expect(policy).toContain('real-database or production-equivalent test');
    expect(policy).toContain('Duplicate-safe behavior, timeout/bounds, failure semantics');
    expect(policy).toContain('ADR-079');
    expect(policy).toMatch(/branch-protection writer is retired/);
    expect(policy).toMatch(/static reachability proof/);
    expect(policy).toMatch(/final exact-head\s+production-mutation corpus closure/i);
    expect(policy).toMatch(/retained-entrypoint targeted validator-order evidence/);
    expect(policy).toMatch(/hosted exact-head\s+CI/);
    expect(decisions).toContain('## ADR-081: Draft Minimum Governance Adoption Boundaries');
    expect(decisions).toContain('**Status:** Proposed');
    expect(decisions).toContain('### Alternatives');
    expect(decisions).toContain('### Supersession');
    expect(decisions).toContain('### Accepted risks');
    expect(decisions).toContain('### Rollback');
    expect(decisions).toContain('### Revisit triggers');
    expect(decisions).toContain('Option A');
    expect(decisions).toContain('force-push risk');
    expect(decisions).toMatch(/branch-protection writer is retired/);
    expect(decisions).toMatch(/final exact-head\s+production-mutation corpus closure/);
    expect(decisions).toMatch(/retained-entrypoint targeted\s+validator-order evidence/);
    expect(decisions).toMatch(
      /Never use force push, down migration, provider mutation, or branch-policy\s+overwrite/
    );
  });

  it('routes production actions only through guarded canonical procedure', async () => {
    const canonicalGuide = await readRepositoryFile(canonicalGuidePath);

    expect(canonicalGuide).toContain('status: DRAFT');
    expect(canonicalGuide).toMatch(/Current UNKNOWN prerequisites block their\s+applicable action/);
    expect(canonicalGuide).toContain('zero mutation dispatch');
    expect(canonicalGuide).toMatch(/branch-protection writer is retired/);
    expect(canonicalGuide).toMatch(/static\s+reachability proof/);
    expect(canonicalGuide).toMatch(/final exact-head\s+production-mutation corpus closure/i);
    expect(canonicalGuide).toMatch(/retained-entrypoint targeted\s+validator-order evidence/i);
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
      expect(command, commandPath).toMatch(
        /final exact-head\s+production-mutation corpus closure/i
      );
      expect(command, commandPath).toMatch(
        /retained-entrypoint\s+targeted validator-order evidence/i
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
