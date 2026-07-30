import { describe, expect, it } from 'vitest';
import {
  classifyExecutionPath,
  detailedDurationStats,
  metricStats,
  queueWaitMs,
  summarizeTiming,
  workflowDurationMs,
} from '../../../scripts/lib/ci-telemetry-core.mjs';
describe('CI telemetry timing semantics', () => {
  const run = {
    createdAt: '2026-07-30T10:00:00.000Z',
    startedAt: '2026-07-30T10:00:12.000Z',
    updatedAt: '2026-07-30T10:02:12.000Z',
  };
  it('separates queue wait from workflow wall duration', () => {
    expect(queueWaitMs(run)).toBe(12_000);
    expect(workflowDurationMs(run)).toBe(120_000);
  });
  it('reports no workflow duration for a run that has not started', () => {
    const queuedRun = {
      createdAt: '2026-07-30T10:00:00.000Z',
      startedAt: undefined,
      updatedAt: '2026-07-30T10:05:00.000Z',
    };
    expect(workflowDurationMs(queuedRun)).toBeNull();
  });
  it('keeps runner duration separate from zero public-repo billing', () => {
    expect(
      summarizeTiming({
        run_duration_ms: 90_000,
        billable: { UBUNTU: { total_ms: 0, jobs: 1 } },
      })
    ).toEqual({ runnerDurationMinutes: 1.5, billableMinutes: 0 });
  });
  it('returns null only when a metric is unavailable', () => {
    expect(summarizeTiming({})).toEqual({
      runnerDurationMinutes: null,
      billableMinutes: null,
    });
  });
  it('calculates nearest-rank p50 and p95 values', () => {
    expect(metricStats([60_000, 120_000, 180_000, 240_000])).toEqual({
      p50Minutes: 2,
      p95Minutes: 4,
      sampleSize: 4,
    });
  });
});
describe('detailed job and step durations', () => {
  it('groups comparable jobs and steps across sampled runs', () => {
    const detail = detailedDurationStats([
      {
        runId: 1,
        jobs: [
          {
            name: 'Check typecheck',
            startedAt: '2026-07-30T10:00:00.000Z',
            completedAt: '2026-07-30T10:02:00.000Z',
            steps: [
              {
                name: 'Run typecheck',
                startedAt: '2026-07-30T10:00:30.000Z',
                completedAt: '2026-07-30T10:01:30.000Z',
              },
            ],
          },
        ],
      },
      {
        runId: 2,
        jobs: [
          {
            name: 'Check typecheck',
            startedAt: '2026-07-30T11:00:00.000Z',
            completedAt: '2026-07-30T11:03:00.000Z',
            steps: [
              {
                name: 'Run typecheck',
                startedAt: '2026-07-30T11:00:30.000Z',
                completedAt: '2026-07-30T11:02:00.000Z',
              },
            ],
          },
        ],
      },
    ]);
    expect(detail.jobs['Check typecheck']).toEqual({
      p50Minutes: 2,
      p95Minutes: 3,
      sampleSize: 2,
    });
    expect(detail.steps['Check typecheck / Run typecheck']).toEqual({
      p50Minutes: 1,
      p95Minutes: 1.5,
      sampleSize: 2,
    });
  });
});
describe('CI execution-path classification', () => {
  it('classifies skipped Security heavy jobs as a fast path', () => {
    const jobs = [
      { name: 'Trivy filesystem scan', conclusion: 'skipped', steps: [] },
      { name: 'Trivy container scan', conclusion: 'skipped', steps: [] },
      { name: 'License allowlist', conclusion: 'skipped', steps: [] },
      { name: 'OWASP dependency-check', conclusion: 'skipped', steps: [] },
      { name: 'Generate SBOM', conclusion: 'skipped', steps: [] },
      { name: 'security-scan', conclusion: 'success', steps: [] },
    ];
    expect(classifyExecutionPath('.github/workflows/security-scan.yml', jobs)).toBe(
      'fast-path'
    );
  });
  it('classifies successful Security heavy work as a full path', () => {
    const jobs = [
      { name: 'Trivy filesystem scan', conclusion: 'success', steps: [] },
      { name: 'security-scan', conclusion: 'success', steps: [] },
    ];
    expect(classifyExecutionPath('.github/workflows/security-scan.yml', jobs)).toBe(
      'full-path'
    );
  });
  it('uses the named CodeQL skip step instead of workflow-start count', () => {
    const jobs = [
      {
        name: 'analyze',
        conclusion: 'success',
        steps: [{ name: 'Report fast-path skip', conclusion: 'success' }],
      },
    ];
    expect(classifyExecutionPath('.github/workflows/codeql.yml', jobs)).toBe('fast-path');
  });
  it('distinguishes affected and full CI paths', () => {
    expect(
      classifyExecutionPath('.github/workflows/ci-unified.yml', [
        { name: 'Check unit-fast', conclusion: 'success', steps: [] },
        { name: 'Test (Affected Only)', conclusion: 'success', steps: [] },
        { name: 'CI Gate Status', conclusion: 'success', steps: [] },
      ])
    ).toBe('affected-path');
    expect(
      classifyExecutionPath('.github/workflows/ci-unified.yml', [
        { name: 'Check unit-fast', conclusion: 'success', steps: [] },
        { name: 'Test integration', conclusion: 'success', steps: [] },
        { name: 'CI Gate Status', conclusion: 'success', steps: [] },
      ])
    ).toBe('full-path');
  });
  it('attributes a failing full-path job to full-path, not a lighter path', () => {
    expect(
      classifyExecutionPath('.github/workflows/ci-unified.yml', [
        { name: 'Check typecheck', conclusion: 'success', steps: [] },
        { name: 'Check lint', conclusion: 'success', steps: [] },
        { name: 'Check unit-fast', conclusion: 'success', steps: [] },
        { name: 'Test integration', conclusion: 'failure', steps: [] },
        { name: 'CI Gate Status', conclusion: 'failure', steps: [] },
      ])
    ).toBe('full-path');
  });
  it('attributes a failing affected-path job to affected-path, not heavy-path', () => {
    expect(
      classifyExecutionPath('.github/workflows/ci-unified.yml', [
        { name: 'Check unit-fast', conclusion: 'success', steps: [] },
        { name: 'Test (Affected Only)', conclusion: 'failure', steps: [] },
        { name: 'CI Gate Status', conclusion: 'failure', steps: [] },
      ])
    ).toBe('affected-path');
  });
});
