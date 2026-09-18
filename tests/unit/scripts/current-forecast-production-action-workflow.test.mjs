import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';

describe('Current Forecast production action workflow', { retry: 0 }, () => {
  it('is dispatch-only, attempt-one, protected, and identity fenced', async () => {
    const source = await readFile(
      '.github/workflows/current-forecast-production-action.yml',
      'utf8'
    );
    const workflow = YAML.parse(source);
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    const job = workflow.jobs.action;
    expect(job.if).toContain('github.run_attempt == 1');
    expect(job.environment).toBe('production-current-forecast');
    expect(source).toContain('PRODUCTION_DATABASE_DIRECT_HOST_SHA256');
    expect(source).toContain('release_manifest_artifact_archive_sha256');
    expect(source).toContain('test "$DISPATCH_DATABASE" = "$PROTECTED_DATABASE"');
    expect(source).toContain('node scripts/release/current-forecast-production-action.mjs');
  });
});
