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
