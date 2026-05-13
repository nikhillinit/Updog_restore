import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';

import {
  runImportDemoProfileCli,
  runImportDemoProfileCliMain,
} from '../../../scripts/import-demo-profile';
import { buildDemoProfileImportBundle } from '../../fixtures/demo-profile-import-fixture';

function encodedBundle(): string {
  return Buffer.from(JSON.stringify(buildDemoProfileImportBundle()), 'utf8').toString('base64');
}

describe('import-demo-profile CLI', () => {
  it('runs dry-run from an env base64 payload without requiring commit privileges', async () => {
    const result = await runImportDemoProfileCli(
      ['--dry-run', '--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_IMPORT: '1',
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('"mode": "dry-run"');
    expect(result.stdout).toContain('"previewHash"');
  });

  it('requires the demo import gate and a prior preview hash for commit', async () => {
    const gated = await runImportDemoProfileCli(
      ['--dry-run', '--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      }
    );
    expect(gated.exitCode).toBe(2);
    expect(gated.stderr).toContain('DEMO_PROFILE_IMPORT_DISABLED');

    const missingPreview = await runImportDemoProfileCli(
      ['--commit', '--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_IMPORT: '1',
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      }
    );
    expect(missingPreview.exitCode).toBe(2);
    expect(missingPreview.stderr).toContain('--commit requires --preview-hash');
  });

  it('reports a safe bootstrap failure if output writing throws', async () => {
    const processLike: { exitCode?: number } = {};
    const streams = {
      stdout: {
        write: vi.fn(() => {
          throw new Error('EPIPE');
        }),
      },
      stderr: {
        write: vi.fn(),
      },
    };

    await runImportDemoProfileCliMain(
      ['--dry-run', '--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_IMPORT: '1',
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      },
      streams,
      processLike
    );

    expect(processLike.exitCode).toBe(1);
    expect(streams.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('CLI_BOOTSTRAP_FAILED')
    );
  });
});
