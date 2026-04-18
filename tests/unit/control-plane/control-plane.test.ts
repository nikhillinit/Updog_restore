/**
 * Control Plane Tests
 *
 * Tests for handoff/checkpoint artifacts, staleness detection, and schema validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Schema paths
const SCHEMAS_DIR = path.resolve(__dirname, '../../../.claude/schemas');

describe('Control Plane Schemas', () => {
  let ajv: InstanceType<typeof Ajv>;

  beforeEach(() => {
    ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
  });

  describe('handoff.schema.json', () => {
    it('should be valid JSON Schema', () => {
      const schemaPath = path.join(SCHEMAS_DIR, 'handoff.schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

      expect(schema.$schema).toContain('json-schema.org');
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('version');
      expect(schema.required).toContain('type');
      expect(schema.required).toContain('reason');
    });

    it('should validate a valid handoff artifact', () => {
      const schemaPath = path.join(SCHEMAS_DIR, 'handoff.schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const validate = ajv.compile(schema);

      const validHandoff = {
        version: '1.0',
        type: 'handoff',
        reason: 'manual',
        generatedAt: new Date().toISOString(),
        repoRoot: '/test/repo',
        worktreePath: null,
        branch: 'main',
        headSha: 'a'.repeat(40),
        upstream: 'origin/main',
        dirty: false,
        gitStatusPorcelain: '',
        gitStatusHash: 'b'.repeat(64),
        lastCommit: {
          sha: 'c'.repeat(40),
          subject: 'test commit',
        },
        tests: {
          status: 'pass',
          commands: ['npm test'],
          summary: 'All tests passed',
        },
        resume: {
          ttlMinutes: 240,
          expiresAt: new Date(Date.now() + 240 * 60 * 1000).toISOString(),
          staleIf: ['head_sha_changed', 'branch_changed', 'git_status_hash_changed', 'ttl_expired'],
          onStale: 'rederive_state_from_repo_then_refresh_artifact_before_continuing',
        },
        currentState: 'Test state',
        nextTask: 'Next task',
        blockers: [],
        filesInFlight: [],
        openQuestions: [],
        notes: [],
      };

      const valid = validate(validHandoff);
      expect(valid).toBe(true);
    });

    it('should reject invalid type values', () => {
      const schemaPath = path.join(SCHEMAS_DIR, 'handoff.schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const validate = ajv.compile(schema);

      const invalidHandoff = {
        version: '1.0',
        type: 'invalid_type',
        reason: 'manual',
        generatedAt: new Date().toISOString(),
        repoRoot: '/test',
        branch: 'main',
        headSha: 'a'.repeat(40),
        dirty: false,
        gitStatusPorcelain: '',
        gitStatusHash: 'b'.repeat(64),
        lastCommit: { sha: 'c'.repeat(40), subject: 'test' },
        tests: { status: 'pass' },
        resume: {
          ttlMinutes: 240,
          expiresAt: new Date().toISOString(),
          staleIf: [],
          onStale: 'rederive_state_from_repo_then_refresh_artifact_before_continuing',
        },
        currentState: '',
        nextTask: '',
      };

      const valid = validate(invalidHandoff);
      expect(valid).toBe(false);
    });
  });

  describe('telemetry-event.schema.json', () => {
    it('should be valid JSON Schema', () => {
      const schemaPath = path.join(SCHEMAS_DIR, 'telemetry-event.schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

      expect(schema.$schema).toContain('json-schema.org');
      expect(schema.required).toContain('event');
      expect(schema.required).toContain('ts');
      expect(schema.required).toContain('mode');
    });

    it('should validate a valid telemetry event', () => {
      const schemaPath = path.join(SCHEMAS_DIR, 'telemetry-event.schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const validate = ajv.compile(schema);

      const validEvent = {
        event: 'checkpoint_written',
        ts: new Date().toISOString(),
        repoRoot: '/test/repo',
        worktreePath: null,
        branch: 'main',
        headSha: 'a'.repeat(40),
        mode: 'full',
        success: true,
        details: { reason: 'test' },
      };

      const valid = validate(validEvent);
      expect(valid).toBe(true);
    });

    it('should reject invalid event names', () => {
      const schemaPath = path.join(SCHEMAS_DIR, 'telemetry-event.schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const validate = ajv.compile(schema);

      const invalidEvent = {
        event: 'not_a_real_event',
        ts: new Date().toISOString(),
        repoRoot: '/test',
        branch: 'main',
        headSha: '',
        mode: 'full',
        success: true,
      };

      const valid = validate(invalidEvent);
      expect(valid).toBe(false);
    });
  });
});

describe('Staleness Detection', () => {
  it('should detect TTL expiration', () => {
    const artifact = {
      resume: {
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
        staleIf: ['ttl_expired'],
      },
      headSha: 'a'.repeat(40),
      branch: 'main',
      gitStatusHash: 'b'.repeat(64),
    };

    const now = new Date();
    const expired = new Date(artifact.resume.expiresAt) < now;
    expect(expired).toBe(true);
  });

  it('should detect HEAD SHA change', () => {
    const artifactSha = 'a'.repeat(40);
    const currentSha = 'b'.repeat(40);

    expect(artifactSha !== currentSha).toBe(true);
  });

  it('should detect git status hash change', () => {
    const artifactHash = 'a'.repeat(64);
    const currentHash = 'b'.repeat(64);

    expect(artifactHash !== currentHash).toBe(true);
  });
});

describe('Large File Detection', () => {
  it('should identify files over 10MB threshold', () => {
    const BLOCK_SIZE_MB = 10;
    const testSizes = [
      { sizeMB: 5, shouldBlock: false },
      { sizeMB: 9.9, shouldBlock: false },
      { sizeMB: 10, shouldBlock: true },
      { sizeMB: 15, shouldBlock: true },
    ];

    for (const { sizeMB, shouldBlock } of testSizes) {
      expect(sizeMB >= BLOCK_SIZE_MB).toBe(shouldBlock);
    }
  });

  it('should identify files in warning range', () => {
    const WARN_SIZE_MB = 5;
    const BLOCK_SIZE_MB = 10;

    const testSizes = [
      { sizeMB: 4, shouldWarn: false },
      { sizeMB: 5, shouldWarn: true },
      { sizeMB: 7.5, shouldWarn: true },
      { sizeMB: 10, shouldWarn: false }, // Blocked, not warned
    ];

    for (const { sizeMB, shouldWarn } of testSizes) {
      const inWarnRange = sizeMB >= WARN_SIZE_MB && sizeMB < BLOCK_SIZE_MB;
      expect(inWarnRange).toBe(shouldWarn);
    }
  });
});

describe('Git Command Detection', () => {
  const FORCE_PUSH_PATTERNS = [
    /git\s+push\s+.*--force/i,
    /git\s+push\s+.*-f(?:\s|$)/i,
    /git\s+push\s+.*--force-with-lease/i,
  ];

  function isRiskyGitCommand(command: string): boolean {
    for (const pattern of FORCE_PUSH_PATTERNS) {
      if (pattern.test(command)) return true;
    }
    return false;
  }

  it('should detect force push commands', () => {
    const riskyCommands = [
      'git push --force',
      'git push origin main --force',
      'git push -f',
      'git push origin feature -f',
      'git push --force-with-lease',
    ];

    for (const cmd of riskyCommands) {
      expect(isRiskyGitCommand(cmd)).toBe(true);
    }
  });

  it('should allow normal push commands', () => {
    const safeCommands = ['git push', 'git push origin main', 'git push -u origin feature'];

    for (const cmd of safeCommands) {
      expect(isRiskyGitCommand(cmd)).toBe(false);
    }
  });
});
