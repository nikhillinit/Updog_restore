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
  strictExtraReviewer: { model: 'claude', lens: 'numeric-precision' },
  aggregator: 'sol',
};

const routingStub = { commands: {} };

function reviewerOutput(
  verdict: 'approve' | 'changes',
  findings: object[] = []
) {
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

  test('rejects moa-strict config without a valid extra reviewer', async () => {
    await expect(
      runMoaReview({
        artifact: 'diff',
        task: 't',
        mode: 'moa-strict',
        moaConfig: { ...moaConfig, strictExtraReviewer: null },
        routing: routingStub,
      })
    ).rejects.toThrow(
      'runMoaReview: moa-strict mode requires moaConfig.strictExtraReviewer'
    );
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
      model === 'terra'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('approve');
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
      model === 'terra'
        ? { code: 1, output: 'crash' }
        : reviewerOutput('approve');
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
    expect(result.votes.find((vote) => vote.model === 'terra')?.verdict).toBe(
      'error'
    );
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
      return model === 'luna'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('approve');
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
      model === 'claude'
        ? { code: 1, output: 'crash' }
        : reviewerOutput('approve');
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
      model === 'terra'
        ? { code: 0, output: 'LGTM!' }
        : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.votes.find((vote) => vote.model === 'terra')?.verdict).toBe(
      'error'
    );
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
      model === 'terra'
        ? reviewerOutput('changes', [first])
        : reviewerOutput('changes', [second]);
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
      model === 'terra'
        ? reviewerOutput('changes', [low])
        : reviewerOutput('changes', [finding]);
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
      if (model === 'sol')
        return { code: 0, output: 'Merged review narrative.' };
      return model === 'terra'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('approve');
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
