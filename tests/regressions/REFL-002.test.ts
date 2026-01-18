// REFLECTION_ID: REFL-002
// This test is linked to: docs/skills/REFL-002-post-merge-jobs-not-validated-by-pr-ci.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-002: Post-Merge Jobs Not Validated by PR CI
 *
 * Jobs with push-only conditions are not validated during PR CI,
 * leading to post-merge failures when their inputs change.
 */
describe('REFL-002: Post-Merge Jobs Not Validated by PR CI', () => {
  // Simulates workflow YAML parsing to detect push-only jobs
  function findPushOnlyJobs(workflowYaml: string): string[] {
    const pushOnlyJobs: string[] = [];
    // Match job names including hyphens ([\w-]+)
    const jobPattern = /([\w-]+):\s*\n\s*if:\s*github\.event_name\s*==\s*['"]push['"]/g;
    let match;
    while ((match = jobPattern.exec(workflowYaml)) !== null) {
      pushOnlyJobs.push(match[1]);
    }
    return pushOnlyJobs;
  }

  // Simulates checking if an artifact schema is valid
  function validateMetricsSchema(json: unknown): { valid: boolean; error?: string } {
    if (typeof json !== 'object' || json === null) {
      return { valid: false, error: 'Must be an object' };
    }
    const obj = json as Record<string, unknown>;
    if (typeof obj.size !== 'number') {
      return { valid: false, error: 'size must be a number' };
    }
    if (typeof obj.timestamp !== 'string') {
      return { valid: false, error: 'timestamp must be a string' };
    }
    return { valid: true };
  }

  describe('Anti-pattern: Push-only jobs invisible to PR CI', () => {
    it('should detect jobs with push-only conditions', () => {
      const workflowYaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build

  report-metrics:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: build
    steps:
      - run: upload-metrics
`;

      const pushOnlyJobs = findPushOnlyJobs(workflowYaml);

      // The anti-pattern: this job won't run during PR checks
      expect(pushOnlyJobs).toContain('report-metrics');
      expect(pushOnlyJobs).not.toContain('build');
    });

    it('should demonstrate schema change breaking post-merge job', () => {
      // Old schema that post-merge job expects
      const oldSchema = { size: 158549, timestamp: '2026-01-18T00:00:00Z' };

      // New schema change made in PR (adds entries, changes structure)
      const newSchemaBreaking = {
        entries: [{ name: 'main.js', size: 158549 }],
        timestamp: '2026-01-18T00:00:00Z',
        // 'size' field removed - BREAKING CHANGE
      };

      // Old schema validates
      expect(validateMetricsSchema(oldSchema).valid).toBe(true);

      // New schema breaks existing consumers expecting 'size' as number
      const validation = validateMetricsSchema(newSchemaBreaking);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('size must be a number');
    });
  });

  describe('Verified fix: Schema validation before artifact upload', () => {
    it('should validate schema before upload', () => {
      // Backward-compatible new schema
      const backwardCompatibleSchema = {
        size: 158549, // Keep for legacy consumers
        timestamp: '2026-01-18T00:00:00Z',
        entries: [{ name: 'main.js', size: 158549 }], // New field
      };

      const validation = validateMetricsSchema(backwardCompatibleSchema);
      expect(validation.valid).toBe(true);
    });

    it('should catch invalid schema before upload', () => {
      const invalidSchemas = [
        { timestamp: '2026-01-18' }, // Missing size
        { size: '158KB', timestamp: '2026-01-18' }, // size is string
        { size: 158549 }, // Missing timestamp
        null, // Not an object
      ];

      for (const schema of invalidSchemas) {
        const validation = validateMetricsSchema(schema);
        expect(validation.valid).toBe(false);
      }
    });

    it('should identify all workflow jobs needing audit', () => {
      const complexWorkflow = `
jobs:
  lint:
    runs-on: ubuntu-latest
  test:
    runs-on: ubuntu-latest
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  metrics:
    if: github.event_name == 'push'
  notify:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
`;

      const pushOnlyJobs = findPushOnlyJobs(complexWorkflow);

      // All push-only jobs should be identified for audit
      expect(pushOnlyJobs).toHaveLength(3);
      expect(pushOnlyJobs).toContain('deploy');
      expect(pushOnlyJobs).toContain('metrics');
      expect(pushOnlyJobs).toContain('notify');
    });
  });
});
