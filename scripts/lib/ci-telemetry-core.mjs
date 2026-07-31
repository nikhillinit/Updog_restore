const MS_PER_MINUTE = 60_000;
const SECURITY_HEAVY_JOBS = new Set([
  'Trivy filesystem scan',
  'Trivy container scan',
  'License allowlist',
  'OWASP dependency-check',
  'Generate SBOM',
]);
function durationBetween(startValue, endValue) {
  const start = Date.parse(startValue ?? '');
  const end = Date.parse(endValue ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}
function roundMinutes(milliseconds) {
  return Math.round((milliseconds / MS_PER_MINUTE) * 100) / 100;
}
export function queueWaitMs(run) {
  return durationBetween(run.createdAt, run.startedAt);
}
export function workflowDurationMs(run) {
  return durationBetween(run.startedAt ?? run.createdAt, run.updatedAt);
}
export function metricStats(valuesMs) {
  const values = valuesMs
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const nearestRank = (percentile) => {
    if (values.length === 0) return null;
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(values.length - 1, index))];
  };
  return {
    p50Minutes: values.length ? roundMinutes(nearestRank(50)) : null,
    p95Minutes: values.length ? roundMinutes(nearestRank(95)) : null,
    sampleSize: values.length,
  };
}
export function summarizeTiming(timing) {
  const runnerDurationMinutes =
    typeof timing?.run_duration_ms === 'number'
      ? roundMinutes(timing.run_duration_ms)
      : null;
  const billableEntries =
    timing?.billable && typeof timing.billable === 'object'
      ? Object.values(timing.billable)
      : null;
  const billableTotalMs = billableEntries?.reduce(
    (sum, entry) =>
      sum + (entry && typeof entry.total_ms === 'number' ? entry.total_ms : 0),
    0
  );
  return {
    runnerDurationMinutes,
    billableMinutes:
      billableEntries === null ? null : roundMinutes(billableTotalMs),
  };
}
export function detailedDurationStats(detailedRuns) {
  const jobDurations = new Map();
  const stepDurations = new Map();
  for (const detail of detailedRuns) {
    for (const job of detail.jobs ?? []) {
      const jobDuration = durationBetween(job.startedAt, job.completedAt);
      if (jobDuration !== null) {
        const values = jobDurations.get(job.name) ?? [];
        values.push(jobDuration);
        jobDurations.set(job.name, values);
      }
      for (const step of job.steps ?? []) {
        const stepDuration = durationBetween(step.startedAt, step.completedAt);
        if (stepDuration === null) continue;
        const key = `${job.name} / ${step.name}`;
        const values = stepDurations.get(key) ?? [];
        values.push(stepDuration);
        stepDurations.set(key, values);
      }
    }
  }
  const summarize = (entries) =>
    Object.fromEntries(
      [...entries]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, durations]) => [name, metricStats(durations)])
    );
  return {
    jobs: summarize(jobDurations),
    steps: summarize(stepDurations),
  };
}
export function classifyExecutionPath(workflowPath, jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return 'unknown';
  if (workflowPath === '.github/workflows/security-scan.yml') {
    const heavyJobs = jobs.filter((job) => SECURITY_HEAVY_JOBS.has(job.name));
    if (heavyJobs.length === 0) return 'unknown';
    return heavyJobs.every((job) => job.conclusion === 'skipped')
      ? 'fast-path'
      : 'full-path';
  }
  if (workflowPath === '.github/workflows/codeql.yml') {
    const steps = jobs.flatMap((job) => job.steps ?? []);
    if (
      steps.some(
        (step) =>
          step.name === 'Report fast-path skip' && step.conclusion === 'success'
      )
    ) {
      return 'fast-path';
    }
    return steps.some(
      (step) =>
        step.conclusion === 'success' &&
        /github\/codeql-action\/(?:init|analyze)/.test(step.name)
    )
      ? 'full-path'
      : 'unknown';
  }
  if (workflowPath === '.github/workflows/ci-unified.yml') {
    const succeeded = new Set(
      jobs
        .filter((job) => job.conclusion === 'success')
        .map((job) => job.name)
    );
    if (
      ['Test integration', 'Test e2e', 'Test validate-core'].some((name) =>
        succeeded.has(name)
      )
    ) {
      return 'full-path';
    }
    if (succeeded.has('Test (Affected Only)')) return 'affected-path';
    if ([...succeeded].some((name) => name.startsWith('Check '))) {
      return 'heavy-path';
    }
    if (succeeded.has('CI Gate Status')) return 'fast-path';
  }
  return 'unknown';
}
