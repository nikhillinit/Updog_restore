import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import { runInitMemoryManagerCli } from '../../../scripts/init-memory-manager';

describe('init-memory-manager.ts', () => {
  it('writes package-free session context now that package-backed memory is decoupled', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'init-memory-manager-'));
    const streams = {
      stdout: {
        write: vi.fn(),
      },
      stderr: {
        write: vi.fn(),
      },
    };

    try {
      const exitCode = await runInitMemoryManagerCli(['--session-id', 'test-session'], {
        cwd,
        now: () => new Date('2026-05-27T00:00:00.000Z'),
        streams,
      });

      const sessionInfo = JSON.parse(
        await readFile(path.join(cwd, '.session-memory.json'), 'utf-8')
      );

      expect(exitCode).toBe(0);
      expect(sessionInfo).toMatchObject({
        sessionId: 'test-session',
        mode: 'repo-context-only',
        memoriesLoaded: 0,
        memorySource: 'codex-workspace',
        packageBackedMemory: 'retired',
      });
      expect(streams.stderr.write).not.toHaveBeenCalled();
      expect(streams.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('wrote package-free session context')
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
