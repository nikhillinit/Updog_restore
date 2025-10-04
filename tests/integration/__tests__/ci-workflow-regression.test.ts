import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

describe('CI Workflow Regression - Fix #4', () => {
  describe('Separate jobs for base and PR builds (no race conditions)', () => {
    it('should use 3 separate jobs: build-base, build-pr, compare', async () => {
      // Original bug: Single job with multiple checkouts caused race conditions
      // Fix: Split into 3 jobs with artifact passing

      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Should have exactly 3 jobs
      expect(workflow.jobs).toBeDefined();
      expect(Object.keys(workflow.jobs)).toContain('build-base');
      expect(Object.keys(workflow.jobs)).toContain('build-pr');
      expect(Object.keys(workflow.jobs)).toContain('compare');

      // Verify compare job depends on both builds
      expect(workflow.jobs.compare.needs).toBeDefined();
      expect(workflow.jobs.compare.needs).toEqual(
        expect.arrayContaining(['build-base', 'build-pr'])
      );
    });

    it('should build base branch in isolated job (no contamination)', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const buildBase = workflow.jobs['build-base'];
      expect(buildBase).toBeDefined();

      // Should checkout base branch
      const checkoutStep = buildBase.steps.find(
        (step: any) => step.uses?.includes('actions/checkout')
      );
      expect(checkoutStep).toBeDefined();
      expect(checkoutStep.with?.ref).toBe('${{ github.base_ref }}');

      // Should build
      const buildStep = buildBase.steps.find(
        (step: any) => step.run?.includes('npm run build')
      );
      expect(buildStep).toBeDefined();

      // Should upload artifact (not write to workspace)
      const uploadStep = buildBase.steps.find(
        (step: any) => step.uses?.includes('actions/upload-artifact')
      );
      expect(uploadStep).toBeDefined();
    });

    it('should build PR branch in isolated job (no contamination)', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const buildPR = workflow.jobs['build-pr'];
      expect(buildPR).toBeDefined();

      // Should checkout PR branch (default)
      const checkoutStep = buildPR.steps.find(
        (step: any) => step.uses?.includes('actions/checkout')
      );
      expect(checkoutStep).toBeDefined();

      // Should build
      const buildStep = buildPR.steps.find(
        (step: any) => step.run?.includes('npm run build')
      );
      expect(buildStep).toBeDefined();

      // Should upload artifact
      const uploadStep = buildPR.steps.find(
        (step: any) => step.uses?.includes('actions/upload-artifact')
      );
      expect(uploadStep).toBeDefined();
    });

    it('should compare results using artifacts (not file system)', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];
      expect(compare).toBeDefined();

      // Should download both artifacts
      const downloadSteps = compare.steps.filter(
        (step: any) => step.uses?.includes('actions/download-artifact')
      );
      expect(downloadSteps.length).toBeGreaterThanOrEqual(2);

      // Should have download for base results
      const baseDownload = downloadSteps.find(
        (step: any) => step.with?.name?.includes('base')
      );
      expect(baseDownload).toBeDefined();

      // Should have download for PR results
      const prDownload = downloadSteps.find(
        (step: any) => step.with?.name?.includes('pr')
      );
      expect(prDownload).toBeDefined();
    });
  });

  describe('Artifacts for size comparison (no file race conditions)', () => {
    it('should upload artifacts in build jobs', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Base job should upload
      const buildBase = workflow.jobs['build-base'];
      const baseUpload = buildBase.steps.find(
        (step: any) => step.uses?.includes('actions/upload-artifact@v4')
      );
      expect(baseUpload).toBeDefined();
      expect(baseUpload.with?.name).toBeDefined();

      // PR job should upload
      const buildPR = workflow.jobs['build-pr'];
      const prUpload = buildPR.steps.find(
        (step: any) => step.uses?.includes('actions/upload-artifact@v4')
      );
      expect(prUpload).toBeDefined();
      expect(prUpload.with?.name).toBeDefined();
    });

    it('should download artifacts in compare job', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Should download artifacts
      const downloads = compare.steps.filter(
        (step: any) => step.uses?.includes('actions/download-artifact@v4')
      );
      expect(downloads.length).toBeGreaterThanOrEqual(2);
    });

    it('should NOT have multiple checkout cycles in compare job', async () => {
      // Original bug: Multiple checkouts in same job caused file race conditions
      // Fix: Compare job only checks out once for scripts

      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Count checkout actions
      const checkouts = compare.steps.filter(
        (step: any) => step.uses?.includes('actions/checkout')
      );

      // Should only checkout once (for comparison script)
      expect(checkouts.length).toBeLessThanOrEqual(1);
    });

    it('should NOT switch branches in compare job', async () => {
      // Original bug: git checkout commands caused workspace corruption
      // Fix: No git checkout in compare job

      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Check all run steps for git checkout commands
      const runSteps = compare.steps.filter((step: any) => step.run);

      for (const step of runSteps) {
        const runContent = step.run as string;

        // Should NOT have git checkout (except in checkout action itself)
        if (!step.uses?.includes('actions/checkout')) {
          expect(runContent).not.toMatch(/git\s+checkout/i);
        }
      }
    });
  });

  describe('Race condition prevention', () => {
    it('should prevent file overwrites by using separate workspaces', async () => {
      // Each job gets its own runner/workspace, preventing overwrites

      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Each job should be independent (no shared state)
      const buildBase = workflow.jobs['build-base'];
      const buildPR = workflow.jobs['build-pr'];
      const compare = workflow.jobs['compare'];

      // Build jobs should not depend on each other
      expect(buildBase.needs).toBeUndefined();
      expect(buildPR.needs).toBeUndefined();

      // Only compare depends on builds
      expect(compare.needs).toEqual(['build-base', 'build-pr']);
    });

    it('should use artifacts to pass data between jobs (not files)', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Upload in build jobs
      expect(
        workflow.jobs['build-base'].steps.some(
          (s: any) => s.uses?.includes('upload-artifact')
        )
      ).toBe(true);

      expect(
        workflow.jobs['build-pr'].steps.some(
          (s: any) => s.uses?.includes('upload-artifact')
        )
      ).toBe(true);

      // Download in compare job
      expect(
        workflow.jobs['compare'].steps.some(
          (s: any) => s.uses?.includes('download-artifact')
        )
      ).toBe(true);
    });

    it('should have proper artifact naming (no conflicts)', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Get artifact names
      const baseUpload = workflow.jobs['build-base'].steps.find(
        (s: any) => s.uses?.includes('upload-artifact')
      );
      const prUpload = workflow.jobs['build-pr'].steps.find(
        (s: any) => s.uses?.includes('upload-artifact')
      );

      // Artifact names should be different
      expect(baseUpload.with?.name).toBeDefined();
      expect(prUpload.with?.name).toBeDefined();
      expect(baseUpload.with?.name).not.toBe(prUpload.with?.name);
    });
  });

  describe('Job isolation and data flow', () => {
    it('should run build-base and build-pr in parallel (no dependencies)', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Build jobs should not depend on each other (parallel execution)
      expect(workflow.jobs['build-base'].needs).toBeUndefined();
      expect(workflow.jobs['build-pr'].needs).toBeUndefined();
    });

    it('should run compare only after both builds complete', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      // Compare must wait for both
      expect(workflow.jobs['compare'].needs).toBeDefined();
      expect(workflow.jobs['compare'].needs).toHaveLength(2);
      expect(workflow.jobs['compare'].needs).toContain('build-base');
      expect(workflow.jobs['compare'].needs).toContain('build-pr');
    });

    it('should use consistent Node.js version across all jobs', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const jobs = ['build-base', 'build-pr', 'compare'];

      for (const jobName of jobs) {
        const job = workflow.jobs[jobName];
        const nodeSetup = job.steps.find(
          (s: any) => s.uses?.includes('actions/setup-node')
        );

        if (nodeSetup) {
          expect(nodeSetup.with?.['node-version']).toBe('20');
        }
      }
    });
  });

  describe('Regression: Specific race condition patterns', () => {
    it('should not write results to same filename in workspace', async () => {
      // Original bug: Both branches wrote to size-limit-current.json
      // causing overwrites and race conditions
      // Fix: Use artifacts with separate names

      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Compare job should download artifacts to different paths
      const downloads = compare.steps.filter(
        (s: any) => s.uses?.includes('download-artifact')
      );

      // Each download should specify a different path
      const paths = downloads.map((d: any) => d.with?.path).filter(Boolean);

      // All paths should be unique
      expect(new Set(paths).size).toBe(paths.length);
    });

    it('should handle artifact path correctly in comparison script', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Find the comparison step
      const compareStep = compare.steps.find(
        (s: any) => s.name?.includes('Compare') || s.run?.includes('compare')
      );

      if (compareStep) {
        const runContent = compareStep.run as string;

        // Should move or reference artifact files correctly
        expect(runContent).toMatch(/size-limit|bundle/i);
      }
    });

    it('should fail workflow if bundle size exceeds limits', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      const compare = workflow.jobs['compare'];

      // Should have a step that fails on limit exceeded
      const failStep = compare.steps.find(
        (s: any) => s.name?.includes('Fail') || s.run?.includes('exit 1')
      );

      expect(failStep).toBeDefined();
    });
  });

  describe('Workflow configuration validation', () => {
    it('should trigger on correct branches', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      expect(workflow.on.pull_request).toBeDefined();
      expect(workflow.on.pull_request.branches).toContain('main');
    });

    it('should trigger on relevant file changes only', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow = YAML.parse(workflowContent);

      expect(workflow.on.pull_request.paths).toBeDefined();
      expect(workflow.on.pull_request.paths).toContain('client/**');
      expect(workflow.on.pull_request.paths).toContain('vite.config.ts');
    });

    it('should use actions/upload-artifact@v4 and actions/download-artifact@v4', async () => {
      const workflowPath = path.join(
        process.cwd(),
        '.github/workflows/bundle-size-check.yml'
      );

      const workflowContent = await fs.readFile(workflowPath, 'utf-8');

      // Should use v4 of artifact actions (latest stable)
      expect(workflowContent).toMatch(/actions\/upload-artifact@v4/);
      expect(workflowContent).toMatch(/actions\/download-artifact@v4/);
    });
  });
});
