import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const execFileAsync = promisify(execFile);

async function readWorkflow(name) {
  return YAML.parse(
    await readFile(path.join(process.cwd(), '.github', 'workflows', name), 'utf8')
  );
}

describe('production release dispatch block', () => {
  it('leaves governed provider mutation jobs reachable', async () => {
    const workflow = await readWorkflow('release-production.yml');

    expect(workflow.jobs['stage-production'].if).toBe(
      "${{ inputs.mode != 'railway-workers-only' }}"
    );
    expect(workflow.jobs.promote.if).toBeUndefined();
    expect(workflow.jobs['production-mutation-block']).toBeUndefined();
    expect(workflow.jobs['validate-target'].needs).toBeUndefined();
    expect(workflow.jobs['validate-target']['timeout-minutes']).toBe(15);
  });

  it('validates nonempty full-mode operator evidence before provider mutation', async () => {
    const workflow = await readWorkflow('release-production.yml');

    const validateTargetSteps = workflow.jobs['validate-target'].steps;
    const checkout = validateTargetSteps.find(
      (step) => step.name === 'Checkout exact release validator'
    );
    const setup = validateTargetSteps.find((step) => step.name === 'Setup Node environment');
    const evidenceValidation = validateTargetSteps.find(
      (step) => step.name === 'Validate attested operator evidence before provider mutation'
    );
    expect(checkout.if).toBe("${{ inputs.mode == 'full' }}");
    expect(checkout.with.ref).toBe('${{ inputs.expected_sha }}');
    expect(setup.if).toBe("${{ inputs.mode == 'full' }}");
    expect(evidenceValidation.if).toBe("${{ inputs.mode == 'full' }}");
    expect(evidenceValidation.env).toEqual({
      OPERATOR_EVIDENCE_B64: '${{ inputs.operator_evidence_b64 }}',
    });
    expect(evidenceValidation.run).toContain(
      'node scripts/release/operator-evidence-bundle.mjs decode'
    );
    expect(validateTargetSteps.indexOf(checkout)).toBeLessThan(validateTargetSteps.indexOf(setup));
    expect(validateTargetSteps.indexOf(setup)).toBeLessThan(
      validateTargetSteps.indexOf(evidenceValidation)
    );
    expect(workflow.jobs['baseline-policy-preflight'].needs).toBe('validate-target');
    expect(workflow.jobs['release-proof'].needs).toBe('validate-target');
    expect(workflow.jobs['stage-production'].needs).toEqual([
      'release-proof',
      'schema-audit',
      'baseline-policy-preflight',
    ]);
    expect(workflow.jobs['railway-workers-deploy'].needs).toContain('validate-target');
  });

  it('pins full and Railway-workers-only dispatch modes', async () => {
    const workflow = await readWorkflow('release-production.yml');
    const mode = workflow.on.workflow_dispatch.inputs.mode;

    expect(mode).toMatchObject({
      type: 'choice',
      options: ['full', 'railway-workers-only'],
      default: 'full',
      required: false,
    });
    expect(mode.description).toMatch(/full.*complete release/i);
    expect(mode.description).toMatch(/railway-workers-only.*exact SHA/i);
    expect(mode.description).toMatch(/operator evidence/i);
  });

  it('wires Railway worker deployment before exact-ID verification', async () => {
    const workflow = await readWorkflow('release-production.yml');
    const deploy = workflow.jobs['railway-workers-deploy'];
    const verify = workflow.jobs['railway-workers-verify'];

    expect(deploy).toMatchObject({
      needs: [
        'validate-target',
        'baseline-policy-preflight',
        'release-proof',
        'schema-audit',
        'validate-deployment',
      ],
      if: "${{ !cancelled() && github.run_attempt == 1 && needs.validate-target.result == 'success' && needs.baseline-policy-preflight.result == 'success' && needs.release-proof.result == 'success' && needs.schema-audit.result == 'success' && ((inputs.mode == 'railway-workers-only' && needs.validate-deployment.result == 'skipped') || (inputs.mode != 'railway-workers-only' && needs.validate-deployment.result == 'success')) }}",
      environment: 'Production',
      'timeout-minutes': 45,
    });
    expect(deploy.outputs).toEqual({
      fund_scenario_calc_deployment_id:
        '${{ steps.deploy.outputs.fund_scenario_calc_deployment_id }}',
      capital_call_status_deployment_id:
        '${{ steps.deploy.outputs.capital_call_status_deployment_id }}',
    });
    expect(verify.needs).toBe('railway-workers-deploy');
    expect(verify.if).toBe(
      "${{ !cancelled() && needs.railway-workers-deploy.result == 'success' && github.run_attempt == 1 }}"
    );
    expect(Object.keys(workflow.jobs).indexOf('railway-workers-deploy')).toBeLessThan(
      Object.keys(workflow.jobs).indexOf('railway-workers-verify')
    );

    const deployScripts = deploy.steps.map((step) => step.run ?? '').join('\n');
    expect(deployScripts).toContain(
      'node scripts/release/deploy-railway-workers.mjs --expected-sha "$EXPECTED_SHA"'
    );
    expect(deployScripts).toContain("result.overall !== 'OK'");
    expect(deployScripts).toContain('GITHUB_OUTPUT');
    expect(deployScripts).not.toContain('https://backboard.railway.com/graphql/v2');

    const verifyScripts = verify.steps.map((step) => step.run ?? '').join('\n');
    expect(verifyScripts).toContain(
      '--expected-fund-scenario-deployment-id "$FUND_SCENARIO_CALC_DEPLOYMENT_ID"'
    );
    expect(verifyScripts).toContain(
      '--expected-capital-call-deployment-id "$CAPITAL_CALL_STATUS_DEPLOYMENT_ID"'
    );
  });

  it('keeps deploy-railway-workers as sole tracked workflow caller', async () => {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--', '.github/workflows/*.yml'],
      { cwd: process.cwd() }
    );
    const callers = [];
    for (const relativePath of stdout.split(/\r?\n/).filter(Boolean)) {
      const contents = await readFile(path.join(process.cwd(), relativePath), 'utf8');
      if (contents.includes('scripts/release/deploy-railway-workers.mjs')) {
        callers.push(path.basename(relativePath));
      }
    }
    expect(callers).toEqual(['release-production.yml']);
  });

  it('pins the PowerShell dispatcher to exact live main before invoking GitHub CLI', async () => {
    // .gitattributes materializes this file with CRLF on checkout; normalize
    // so multi-line substring pins hold on both LF and CRLF working copies.
    const script = (
      await readFile(path.join(process.cwd(), 'scripts', 'deploy-production.ps1'), 'utf8')
    ).replaceAll('\r\n', '\n');

    // The former mechanical block is superseded by the governed exact-SHA
    // dispatcher (Child F G4 hardening); its full contract is asserted in
    // tests/regressions/ci-fail-closed.test.ts. This guard keeps the
    // dispatch fail-closed: live-main SHA pinned and no bypass switches.
    expect(script).toContain('$expectedSha -notmatch "^[0-9a-f]{40}$"');
    expect(script).toContain(
      'gh workflow run release-production.yml --ref main --repo $repository --json'
    );
    expect(script).toContain("[ValidateSet('full', 'railway-workers-only')]");
    expect(script).toContain("[string] $Mode = 'full'");
    expect(script).toContain('[Parameter(Mandatory = $false)]\n    [string] $FundHealthPath');
    expect(script).toContain("$operatorEvidenceB64 = ''");
    expect(script).toContain("if ($Mode -eq 'full')");
    expect(script).toContain('All four operator evidence files are required in full mode.');
    expect(script).toContain('mode = $Mode');
    expect(script).toContain('operator_evidence_b64 = $operatorEvidenceB64');
    expect(script).not.toMatch(/\bSkipSmokeTest\b|\bForce\b/);
  });
});
