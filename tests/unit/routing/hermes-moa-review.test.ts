import { describe, expect, test } from 'vitest';

import { extractFindingsReport, validateFindingsReport } from '../../../orchestrate.js';

const validReport = {
  verdict: 'changes',
  summary: 'One high severity issue.',
  findings: [
    {
      file: 'server/routes/funds.ts',
      line: 42,
      severity: 'high',
      lens: 'correctness',
      claim: 'Cursor not validated.',
    },
  ],
};

describe('validateFindingsReport', () => {
  test('accepts a valid report', () => {
    expect(validateFindingsReport(validReport)).toEqual({
      ok: true,
      error: null,
    });
  });

  test('accepts approve with empty findings', () => {
    expect(
      validateFindingsReport({
        verdict: 'approve',
        summary: 'Clean.',
        findings: [],
      }).ok
    ).toBe(true);
  });

  test('rejects unknown verdict', () => {
    expect(validateFindingsReport({ ...validReport, verdict: 'maybe' }).ok).toBe(false);
  });

  test('rejects finding without file', () => {
    const report = {
      ...validReport,
      findings: [{ line: 1, severity: 'low', lens: 'x', claim: 'y' }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });

  test('rejects non-integer line', () => {
    const report = {
      ...validReport,
      findings: [{ ...validReport.findings[0], line: 'forty-two' }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });

  test('rejects unknown severity', () => {
    const report = {
      ...validReport,
      findings: [{ ...validReport.findings[0], severity: 'catastrophic' }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });

  test('rejects non-object input', () => {
    expect(validateFindingsReport('APPROVED').ok).toBe(false);
  });

  test('rejects approve with nonempty findings', () => {
    expect(
      validateFindingsReport({
        verdict: 'approve',
        summary: 's',
        findings: validReport.findings,
      }).ok
    ).toBe(false);
  });

  test('rejects changes with empty findings', () => {
    expect(validateFindingsReport({ verdict: 'changes', summary: 's', findings: [] }).ok).toBe(
      false
    );
  });

  test('rejects non-string evidence', () => {
    const report = {
      ...validReport,
      findings: [{ ...validReport.findings[0], evidence: 42 }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });
});

describe('extractFindingsReport', () => {
  test('extracts a fenced json block from prose', () => {
    const output = [
      'Here is my review.',
      '```json',
      JSON.stringify(validReport),
      '```',
      'Done.',
    ].join('\n');
    const result = extractFindingsReport(output);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.verdict).toBe('changes');
  });

  test('extracts bare JSON output', () => {
    const result = extractFindingsReport(JSON.stringify(validReport));
    expect(result.ok).toBe(true);
  });

  test('uses the last fenced block when several exist', () => {
    const first = JSON.stringify({
      verdict: 'approve',
      summary: 'draft',
      findings: [],
    });
    const output = [
      '```json',
      first,
      '```',
      'Revised:',
      '```json',
      JSON.stringify(validReport),
      '```',
    ].join('\n');
    const result = extractFindingsReport(output);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.verdict).toBe('changes');
  });

  test('extracts fenced JSON when a finding claim contains triple backticks', () => {
    const report = {
      ...validReport,
      findings: [
        {
          ...validReport.findings[0],
          claim: 'Use ``` to describe a fenced code block.',
        },
      ],
    };
    const output = ['```json', JSON.stringify(report), '```'].join('\n');

    const result = extractFindingsReport(output);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.findings[0].claim).toBe('Use ``` to describe a fenced code block.');
    }
  });

  test('fails on missing JSON', () => {
    expect(extractFindingsReport('Looks good to me!').ok).toBe(false);
  });

  test('fails on JSON with wrong shape', () => {
    expect(extractFindingsReport('```json\n{"hello":"world"}\n```').ok).toBe(false);
  });
});

import { findingKey, runMoaReview } from '../../../orchestrate.js';

const moaConfig = {
  reviewers: [
    { model: 'terra', lens: 'correctness' },
    { model: 'luna', lens: 'spec-compliance' },
  ],
  strictReviewers: [
    { model: 'terra', lens: 'correctness' },
    { model: 'luna', lens: 'spec-compliance' },
    { model: 'claude', lens: 'numeric-precision' },
  ],
  aggregator: 'sol',
};

const routingStub = { commands: {} };

function reviewerOutput(verdict: 'approve' | 'changes', findings: object[] = []) {
  return {
    code: 0,
    output: `\`\`\`json\n${JSON.stringify({ verdict, summary: 's', findings })}\n\`\`\``,
  };
}

const finding = {
  file: 'a.ts',
  line: 3,
  severity: 'high',
  lens: 'correctness',
  claim: 'Bad cursor.',
};

describe('findingKey', () => {
  test('normalizes whitespace and case of the claim', () => {
    expect(findingKey({ file: 'a.ts', line: 3, claim: 'Bad  Cursor.' })).toBe(
      '["a.ts",3,"bad cursor."]'
    );
  });
});

describe('runMoaReview', () => {
  test('rejects moa config with fewer than two reviewers', async () => {
    await expect(
      runMoaReview({
        artifact: 'diff',
        task: 't',
        mode: 'moa',
        moaConfig: {
          ...moaConfig,
          reviewers: [{ model: 'terra', lens: 'correctness' }],
        },
        routing: routingStub,
      })
    ).rejects.toThrow('runMoaReview: moa mode requires at least 2 configured reviewers');
  });

  test('rejects a malformed base reviewer before spawning reviewers', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      return reviewerOutput('approve');
    };

    await expect(
      runMoaReview({
        artifact: 'diff',
        task: 't',
        mode: 'moa',
        moaConfig: {
          ...moaConfig,
          reviewers: [{ model: 'terra', lens: 'correctness' }, { model: 'luna' }],
        },
        routing: routingStub,
        executor,
      })
    ).rejects.toThrow(
      'runMoaReview: moaConfig.reviewers entries require non-empty string model and lens'
    );
    expect(calls).toEqual([]);
  });

  test('rejects moa-strict config with exactly two strict reviewers before spawning reviewers', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      return reviewerOutput('approve');
    };

    await expect(
      runMoaReview({
        artifact: 'diff',
        task: 't',
        mode: 'moa-strict',
        moaConfig: {
          ...moaConfig,
          strictReviewers: [
            { model: 'terra', lens: 'correctness' },
            { model: 'luna', lens: 'spec-compliance' },
          ],
        },
        routing: routingStub,
        executor,
      })
    ).rejects.toThrow(
      'runMoaReview: moa-strict mode requires at least 3 configured reviewers in moaConfig.strictReviewers'
    );
    expect(calls).toEqual([]);
  });

  test('rejects a malformed strict reviewer before spawning reviewers', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      return reviewerOutput('approve');
    };

    await expect(
      runMoaReview({
        artifact: 'diff',
        task: 't',
        mode: 'moa-strict',
        moaConfig: {
          ...moaConfig,
          strictReviewers: [
            { model: 'terra', lens: 'correctness' },
            { model: 'luna', lens: 'spec-compliance' },
            { model: 'claude', lens: '' },
          ],
        },
        routing: routingStub,
        executor,
      })
    ).rejects.toThrow(
      'runMoaReview: moaConfig.strictReviewers entries require non-empty string model and lens'
    );
    expect(calls).toEqual([]);
  });

  test('moa mode approves when both reviewers approve; aggregator not spawned for zero findings', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      return reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.approved).toBe(true);
    expect(result.degraded).toBe(false);
    expect(calls.sort()).toEqual(['luna', 'terra']);
  });

  test('moa mode requests changes when any reviewer requests changes; findings are unioned', async () => {
    const executor = async (model: string) =>
      model === 'terra' ? reviewerOutput('changes', [finding]) : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.approved).toBe(false);
    expect(result.findings).toHaveLength(1);
  });

  test('moa mode with one failed reviewer is degraded but still decides from the survivor', async () => {
    const executor = async (model: string) =>
      model === 'terra' ? { code: 1, output: 'crash' } : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.votes.find((vote) => vote.model === 'terra')?.verdict).toBe('error');
  });

  test('non-Error reviewer rejection becomes an error vote without crashing the panel', async () => {
    const nonErrorRejection: unknown = null;
    const executor = async (model: string) => {
      if (model === 'terra') throw nonErrorRejection;
      return reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.votes.find((vote) => vote.model === 'terra')).toMatchObject({
      verdict: 'error',
      error: 'null',
    });
  });

  test('reviewer rejection with a throwing stringifier becomes an unknown error vote', async () => {
    const pathologicalRejection = {
      toString() {
        throw new Error('cannot stringify rejection');
      },
    };
    const executor = async (model: string) => {
      if (model === 'terra') throw pathologicalRejection;
      return reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.votes.find((vote) => vote.model === 'terra')).toMatchObject({
      verdict: 'error',
      error: 'unknown error',
    });
  });

  test('moa mode with all reviewers failed is degraded and not approved', async () => {
    const executor = async () => ({ code: 1, output: 'crash' });
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(false);
  });

  test('moa-strict spawns three reviewers and approves on 2-of-3', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      return model === 'luna' ? reviewerOutput('changes', [finding]) : reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa-strict',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(calls.sort()).toEqual(['claude', 'luna', 'terra']);
    expect(result.approved).toBe(true);
  });

  test('moa-strict fails closed on any degradation even with 2 approvals', async () => {
    const executor = async (model: string) =>
      model === 'claude' ? { code: 1, output: 'crash' } : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa-strict',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(false);
  });

  test('invalid JSON from a reviewer counts as error vote', async () => {
    const executor = async (model: string) =>
      model === 'terra' ? { code: 0, output: 'LGTM!' } : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.votes.find((vote) => vote.model === 'terra')?.verdict).toBe('error');
  });

  test('duplicate findings across reviewers are deduped by findingKey', async () => {
    const duplicate = { ...finding, lens: 'spec-compliance' };
    const executor = async (model: string) =>
      model === 'terra'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('changes', [duplicate]);
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.findings).toHaveLength(1);
  });

  test('distinct findings that share a legacy colon key both survive dedup', async () => {
    const first = { ...finding, file: 'a', line: 3, claim: '4:x' };
    const second = {
      ...finding,
      file: 'a:3',
      line: 4,
      lens: 'spec-compliance',
      claim: 'x',
    };
    const executor = async (model: string) =>
      model === 'terra' ? reviewerOutput('changes', [first]) : reviewerOutput('changes', [second]);
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig: { ...moaConfig, aggregator: null },
      routing: routingStub,
      executor,
    });
    expect(result.findings).toHaveLength(2);
    expect(result.findings).toEqual(expect.arrayContaining([first, second]));
  });

  test('duplicate finding keeps the higher severity', async () => {
    const low = { ...finding, severity: 'low' };
    const executor = async (model: string) =>
      model === 'terra' ? reviewerOutput('changes', [low]) : reviewerOutput('changes', [finding]);
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('high');
  });

  test('aggregator runs when findings exist and its prose is captured', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      if (model === 'sol') return { code: 0, output: 'Merged review narrative.' };
      return model === 'terra' ? reviewerOutput('changes', [finding]) : reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(calls).toContain('sol');
    expect(result.aggregatorSummary).toBe('Merged review narrative.');
  });
});

import { createWorkflowPlan, executeWorkflow } from '../../../orchestrate.js';

describe('createWorkflowPlan with MOA review', () => {
  const ownership = {
    owner: 'sol',
    reviewer: 'claude',
    role: 'worker-executor',
    artifact: 'diff plus tests',
  };

  test('review policy moa inserts a moa-review step after owner', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'pair',
      phase: 'production',
      model: 'sol',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'moa',
      moaConfig: { aggregator: 'sol' },
    });
    const roles = workflow.steps.map((step) => step.role);
    expect(roles.indexOf('moa-review')).toBeGreaterThan(roles.indexOf('owner'));
    expect(workflow.steps.find((step) => step.role === 'moa-review')?.mode).toBe('moa');
  });

  test('review policy none omits moa-review', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'solo',
      phase: 'production',
      model: 'qwen',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'none',
    });
    expect(workflow.steps.some((step) => step.role === 'moa-review')).toBe(false);
  });

  test('review policy none suppresses the reviewer step too', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'pair',
      phase: 'production',
      model: 'qwen',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'none',
    });
    expect(workflow.steps.some((step) => step.role === 'reviewer')).toBe(false);
  });

  test('review workflow mode never gets a moa step (no artifact to review)', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'review',
      phase: 'production',
      model: 'sol',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'moa',
      moaConfig: { aggregator: 'sol' },
    });
    expect(workflow.steps.some((step) => step.role === 'moa-review')).toBe(false);
  });
});

describe('executeWorkflow with MOA review', () => {
  const moaStepPlan = (mode: 'moa' | 'moa-strict') => ({
    phase: 'production',
    risk: 'standard',
    gate: null,
    review: mode,
    workflow: {
      selected: 'pair',
      steps: [
        { role: 'owner', model: 'sol', action: 'execute production lane' },
        {
          role: 'moa-review',
          model: 'sol',
          action: 'multi-model lens review of artifact',
          mode,
        },
        { role: 'reviewer', model: 'claude', action: 'review diff plus tests' },
      ],
    },
  });

  const approvingRunStep = async ({ step }: { step: { role: string } }) =>
    step.role === 'reviewer'
      ? { code: 0, output: 'APPROVED', approved: true }
      : { code: 0, output: 'artifact-v1' };

  test('approved moa and reviewer exit zero with moa result in record', async () => {
    const moaRunner = async () => ({
      approved: true,
      degraded: false,
      findings: [],
      votes: [],
      aggregatorSummary: null,
    });
    const record = await executeWorkflow(moaStepPlan('moa'), {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(0);
    expect(record.moa?.approved).toBe(true);
  });

  test('moa changes trigger repair; second clean round approves', async () => {
    const finding = {
      file: 'a.ts',
      line: 3,
      severity: 'high',
      lens: 'correctness',
      claim: 'Bad cursor.',
    };
    let round = 0;
    const moaRunner = async () => {
      round += 1;
      return round === 1
        ? {
            approved: false,
            degraded: false,
            findings: [finding],
            votes: [],
            aggregatorSummary: null,
          }
        : {
            approved: true,
            degraded: false,
            findings: [],
            votes: [],
            aggregatorSummary: null,
          };
    };
    const record = await executeWorkflow(moaStepPlan('moa'), {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(0);
    expect(record.repairs).toBe(1);
  });

  test('repeated identical findings exit as dry loop without exhausting maxRepairs', async () => {
    const finding = {
      file: 'a.ts',
      line: 3,
      severity: 'high',
      lens: 'correctness',
      claim: 'Bad cursor.',
    };
    let moaCalls = 0;
    const moaRunner = async () => {
      moaCalls += 1;
      return {
        approved: false,
        degraded: false,
        findings: [finding],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const record = await executeWorkflow(moaStepPlan('moa'), {
      runStep: approvingRunStep,
      moaRunner,
      maxRepairs: 5,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(1);
    expect(moaCalls).toBe(2);
    expect(record.repairs).toBe(1);
  });

  test('reintroduced finding after a clean moa round is not treated as a dry loop', async () => {
    const finding = {
      file: 'a.ts',
      line: 3,
      severity: 'high',
      lens: 'correctness',
      claim: 'Bad cursor.',
    };
    let moaCalls = 0;
    const moaRunner = async () => {
      moaCalls += 1;
      const rejects = moaCalls === 1 || moaCalls === 3;
      return {
        approved: !rejects,
        degraded: false,
        findings: rejects ? [finding] : [],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const runStep = async ({ step, attempt }: { step: { role: string }; attempt: number }) => {
      if (step.role === 'reviewer') {
        return attempt === 1
          ? {
              code: 0,
              output: 'Unrelated reviewer feedback.',
              approved: false,
            }
          : { code: 0, output: 'APPROVED', approved: true };
      }
      return { code: 0, output: `artifact-v${attempt}` };
    };

    const record = await executeWorkflow(moaStepPlan('moa'), {
      runStep,
      moaRunner,
      maxRepairs: 5,
      writeRunLedger: null,
    });

    expect(record.exitCode).toBe(0);
    expect(record.approved).toBe(true);
    expect(record.repairs).toBe(3);
    expect(moaCalls).toBe(4);
  });

  test('moa-strict degraded fails immediately without burning repairs', async () => {
    let moaCalls = 0;
    const moaRunner = async () => {
      moaCalls += 1;
      return {
        approved: false,
        degraded: true,
        findings: [],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const record = await executeWorkflow(moaStepPlan('moa-strict'), {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(1);
    expect(record.moa?.degraded).toBe(true);
    expect(moaCalls).toBe(1);
    expect(record.repairs).toBe(0);
  });

  test('workflow without moa step never invokes moaRunner', async () => {
    let called = false;
    const moaRunner = async () => {
      called = true;
      return {
        approved: true,
        degraded: false,
        findings: [],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const plan = {
      phase: 'production',
      risk: 'standard',
      gate: null,
      workflow: {
        selected: 'solo',
        steps: [{ role: 'owner', model: 'codex', action: 'execute production lane' }],
      },
    };
    const record = await executeWorkflow(plan, {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(called).toBe(false);
    expect(record.exitCode).toBe(0);
  });
});
