// REFLECTION_ID: REFL-029
// This test is linked to: docs/skills/REFL-029-secrets-in-workflow-if-expressions.md
// Do not rename without updating the reflection's test_file field.

import { describe, expect, it } from 'vitest';

function hasSecretInIfExpression(workflow: string): boolean {
  return /^\s*if:\s*\$\{\{\s*secrets\./m.test(workflow);
}

function usesSafeOptionalSecretPattern(workflow: string): boolean {
  const hasSecretInEnv = /^\s+[A-Z0-9_]+:\s*\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/m.test(workflow);
  const hasEnvGuard = /^\s*if:\s*\$\{\{\s*env\.[A-Z0-9_]+\s*(==|!=)\s*''\s*\}\}/m.test(workflow);
  return hasSecretInEnv && hasEnvGuard && !hasSecretInIfExpression(workflow);
}

describe('REFL-029: GitHub Actions Secrets in if Expressions Invalidate Workflows', () => {
  it('flags job-level secret checks in if expressions as unsafe', () => {
    const workflow = `
jobs:
  zap_scan:
    if: \${{ secrets.ZAP_BASE_URL != '' }}
    runs-on: ubuntu-latest
`;

    expect(hasSecretInIfExpression(workflow)).toBe(true);
    expect(usesSafeOptionalSecretPattern(workflow)).toBe(false);
  });

  it('accepts env-based step guards for optional secret-backed jobs', () => {
    const workflow = `
jobs:
  zap_scan:
    runs-on: ubuntu-latest
    env:
      ZAP_BASE_URL: \${{ secrets.ZAP_BASE_URL }}
    steps:
      - name: Skip when not configured
        if: \${{ env.ZAP_BASE_URL == '' }}
        run: echo "skip"
      - name: Run scan
        if: \${{ env.ZAP_BASE_URL != '' }}
        uses: zaproxy/action-baseline@v0.12.0
`;

    expect(hasSecretInIfExpression(workflow)).toBe(false);
    expect(usesSafeOptionalSecretPattern(workflow)).toBe(true);
  });

  it('treats zero-job workflow failures as a workflow-definition smell', () => {
    const runSummary = {
      conclusion: 'failure',
      jobs: [] as string[],
      message: 'This run likely failed because of a workflow file issue.',
    };

    const looksLikeWorkflowValidationFailure =
      runSummary.conclusion === 'failure' &&
      runSummary.jobs.length === 0 &&
      runSummary.message.includes('workflow file issue');

    expect(looksLikeWorkflowValidationFailure).toBe(true);
  });
});
