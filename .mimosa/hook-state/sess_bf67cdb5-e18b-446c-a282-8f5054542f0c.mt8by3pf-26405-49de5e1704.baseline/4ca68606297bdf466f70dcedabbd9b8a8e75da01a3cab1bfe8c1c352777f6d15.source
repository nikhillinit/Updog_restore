// REFLECTION_ID: REFL-017
// This test is linked to: docs/skills/REFL-017-ci-workflow-permission-errors.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-017: CI Workflow Permission Errors
 *
 * GitHub Actions workflows that try to comment on PRs or modify repository
 * content fail with cryptic "HttpError: Not Found" errors when they lack
 * required permissions.
 */
describe('REFL-017: CI Workflow Permission Errors', () => {
  // Permission types
  type PermissionLevel = 'read' | 'write' | 'none';

  interface WorkflowPermissions {
    contents?: PermissionLevel;
    'pull-requests'?: PermissionLevel;
    issues?: PermissionLevel;
    packages?: PermissionLevel;
    actions?: PermissionLevel;
    checks?: PermissionLevel;
  }

  interface WorkflowJob {
    name: string;
    permissions?: WorkflowPermissions;
    steps: Array<{
      name: string;
      uses?: string;
      run?: string;
      with?: Record<string, string>;
    }>;
  }

  interface Workflow {
    name: string;
    on: string | string[] | Record<string, unknown>;
    permissions?: WorkflowPermissions;
    jobs: Record<string, WorkflowJob>;
  }

  // Analyze workflow for permission issues
  interface PermissionAnalysis {
    hasExplicitPermissions: boolean;
    requiredPermissions: WorkflowPermissions;
    issues: string[];
    recommendations: string[];
  }

  function analyzeWorkflowPermissions(workflow: Workflow): PermissionAnalysis {
    const issues: string[] = [];
    const recommendations: string[] = [];
    const requiredPermissions: WorkflowPermissions = {};

    const hasExplicitPermissions =
      !!workflow.permissions ||
      Object.values(workflow.jobs).some((job) => !!job.permissions);

    // Analyze each job
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const step of job.steps) {
        // Check for PR comment actions
        if (
          step.uses?.includes('pr-comment') ||
          step.with?.script?.includes('createComment') ||
          step.run?.includes('gh pr comment')
        ) {
          requiredPermissions['pull-requests'] = 'write';
          if (!job.permissions?.['pull-requests']) {
            issues.push(
              `Job "${jobName}" needs pull-requests: write for PR comments`
            );
          }
        }

        // Check for checkout
        if (step.uses?.includes('actions/checkout')) {
          requiredPermissions.contents = 'read';
        }

        // Check for pushing commits
        if (step.run?.includes('git push') || step.uses?.includes('push')) {
          requiredPermissions.contents = 'write';
          if (!job.permissions?.contents || job.permissions.contents !== 'write') {
            issues.push(
              `Job "${jobName}" needs contents: write for git push`
            );
          }
        }

        // Check for creating releases
        if (step.uses?.includes('create-release') || step.run?.includes('gh release')) {
          requiredPermissions.contents = 'write';
        }

        // Check for GitHub script API calls
        if (step.uses?.includes('github-script')) {
          const script = step.with?.script ?? '';
          if (script.includes('issues.createComment')) {
            requiredPermissions['pull-requests'] = 'write';
          }
          if (script.includes('repos.createRelease')) {
            requiredPermissions.contents = 'write';
          }
        }
      }
    }

    // Generate recommendations
    if (!hasExplicitPermissions && Object.keys(requiredPermissions).length > 0) {
      recommendations.push(
        'Add explicit permissions block to workflow for security'
      );
    }

    if (requiredPermissions['pull-requests'] === 'write') {
      recommendations.push('Add: pull-requests: write');
    }

    if (requiredPermissions.contents === 'write') {
      recommendations.push('Add: contents: write');
    }

    return {
      hasExplicitPermissions,
      requiredPermissions,
      issues,
      recommendations,
    };
  }

  describe('Anti-pattern: Missing workflow permissions', () => {
    it('should identify missing permissions for PR comments', () => {
      const workflow: Workflow = {
        name: 'Bundle Size Check',
        on: 'pull_request',
        // No permissions block!
        jobs: {
          check: {
            name: 'Check bundle size',
            steps: [
              { name: 'Checkout', uses: 'actions/checkout@v4' },
              { name: 'Build', run: 'npm run build' },
              {
                name: 'Comment on PR',
                uses: 'actions/github-script@v7',
                with: {
                  script: `github.rest.issues.createComment({
                    issue_number: context.issue.number,
                    body: 'Bundle size report'
                  })`,
                },
              },
            ],
          },
        },
      };

      const analysis = analyzeWorkflowPermissions(workflow);

      expect(analysis.hasExplicitPermissions).toBe(false);
      expect(analysis.requiredPermissions['pull-requests']).toBe('write');
      expect(analysis.issues).toContain(
        'Job "check" needs pull-requests: write for PR comments'
      );
    });

    it('should demonstrate typical error messages', () => {
      const typicalErrors = [
        'HttpError: Not Found',
        'HttpError: Resource not accessible by integration',
        'Error: Could not resolve to a Repository with the name',
        '403 Forbidden',
      ];

      // These errors often indicate permission issues, not actual 404s
      const isProbablyPermissionIssue = (error: string) =>
        error.includes('Not Found') ||
        error.includes('not accessible') ||
        error.includes('Forbidden') ||
        error.includes('Could not resolve');

      typicalErrors.forEach((error) => {
        expect(isProbablyPermissionIssue(error)).toBe(true);
      });
    });

    it('should identify missing permissions for git push', () => {
      const workflow: Workflow = {
        name: 'Auto-format',
        on: 'push',
        jobs: {
          format: {
            name: 'Format code',
            steps: [
              { name: 'Checkout', uses: 'actions/checkout@v4' },
              { name: 'Format', run: 'npm run format' },
              { name: 'Commit', run: 'git add . && git commit -m "format" && git push' },
            ],
          },
        },
      };

      const analysis = analyzeWorkflowPermissions(workflow);

      expect(analysis.requiredPermissions.contents).toBe('write');
      expect(analysis.issues).toContain(
        'Job "format" needs contents: write for git push'
      );
    });
  });

  describe('Verified fix: Explicit permission declarations', () => {
    it('should validate workflow with proper permissions', () => {
      const workflow: Workflow = {
        name: 'Bundle Size Check',
        on: 'pull_request',
        permissions: {
          contents: 'read',
          'pull-requests': 'write',
        },
        jobs: {
          check: {
            name: 'Check bundle size',
            permissions: {
              'pull-requests': 'write',
            },
            steps: [
              { name: 'Checkout', uses: 'actions/checkout@v4' },
              { name: 'Build', run: 'npm run build' },
              {
                name: 'Comment on PR',
                uses: 'actions/github-script@v7',
                with: {
                  script: `github.rest.issues.createComment({...})`,
                },
              },
            ],
          },
        },
      };

      const analysis = analyzeWorkflowPermissions(workflow);

      expect(analysis.hasExplicitPermissions).toBe(true);
      // With explicit permissions at job level, no issues should be reported
      expect(analysis.issues).toHaveLength(0);
    });

    it('should support job-level permissions', () => {
      const workflow: Workflow = {
        name: 'Multi-job workflow',
        on: 'pull_request',
        jobs: {
          build: {
            name: 'Build',
            permissions: { contents: 'read' },
            steps: [{ name: 'Checkout', uses: 'actions/checkout@v4' }],
          },
          comment: {
            name: 'Comment',
            permissions: { 'pull-requests': 'write' },
            steps: [
              {
                name: 'Comment on PR',
                uses: 'some-action/pr-comment@v1',
              },
            ],
          },
        },
      };

      const analysis = analyzeWorkflowPermissions(workflow);

      // Job-level permissions count as explicit
      expect(analysis.hasExplicitPermissions).toBe(true);
    });
  });

  describe('Permission reference', () => {
    it('should document common permission mappings', () => {
      const permissionGuide: Record<string, WorkflowPermissions> = {
        'Checkout code': { contents: 'read' },
        'Push commits': { contents: 'write' },
        'Create releases': { contents: 'write' },
        'Comment on PRs': { 'pull-requests': 'write' },
        'Update PR status': { 'pull-requests': 'write' },
        'Create issues': { issues: 'write' },
        'Publish packages': { packages: 'write' },
        'Read workflow runs': { actions: 'read' },
        'Create check runs': { checks: 'write' },
      };

      // Verify guide has expected entries
      expect(permissionGuide['Comment on PRs']).toEqual({
        'pull-requests': 'write',
      });
      expect(permissionGuide['Checkout code']).toEqual({ contents: 'read' });
    });

    it('should validate least-privilege principle', () => {
      function validateLeastPrivilege(permissions: WorkflowPermissions): {
        valid: boolean;
        warnings: string[];
      } {
        const warnings: string[] = [];

        // Check for overly broad permissions
        const hasWriteAll = Object.values(permissions).every((p) => p === 'write');
        if (hasWriteAll && Object.keys(permissions).length > 2) {
          warnings.push(
            'Consider reducing to only required write permissions'
          );
        }

        return { valid: warnings.length === 0, warnings };
      }

      const minimal: WorkflowPermissions = {
        contents: 'read',
        'pull-requests': 'write',
      };

      const excessive: WorkflowPermissions = {
        contents: 'write',
        'pull-requests': 'write',
        issues: 'write',
        packages: 'write',
        actions: 'write',
      };

      expect(validateLeastPrivilege(minimal).valid).toBe(true);
      expect(validateLeastPrivilege(excessive).warnings.length).toBeGreaterThan(0);
    });
  });
});
