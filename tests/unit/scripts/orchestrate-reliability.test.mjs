import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import process from 'node:process';
import { setTimeout } from 'node:timers';

import { describe, expect, it, vi } from 'vitest';

import {
  executeModel,
  executeModelCapture,
  killProcessTree,
  scrubSecrets,
  writeRunLedger,
} from '../../../orchestrate.js';

function makeRouting() {
  return {
    commands: {
      claude: {
        // Absolute path with a separator makes commandExists() resolve via
        // existsSync (deterministic, no real subprocess) instead of which/where.
        defaultBin: process.execPath,
        binEnv: 'CLAUDE_BIN',
        args: [],
        promptDelivery: 'stdin',
      },
    },
  };
}

function createFakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe('killProcessTree', () => {
  it('sends SIGKILL to the negative pid (process group) on POSIX', () => {
    const kill = vi.fn();
    killProcessTree({ pid: 555 }, { platform: 'darwin', kill });
    expect(kill).toHaveBeenCalledWith(-555, 'SIGKILL');
  });

  it('falls back to child.kill if the process-group kill throws (group already gone)', () => {
    const kill = vi.fn(() => {
      throw new Error('ESRCH');
    });
    const childKill = vi.fn();
    killProcessTree({ pid: 555, kill: childKill }, { platform: 'darwin', kill });
    expect(childKill).toHaveBeenCalledWith('SIGKILL');
  });

  it('shells out to taskkill /T /F on win32', () => {
    const spawnSyncImpl = vi.fn();
    killProcessTree({ pid: 555 }, { platform: 'win32', spawnSyncImpl });
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '555', '/T', '/F'],
      expect.any(Object)
    );
  });

  it('does nothing when given a child with no pid', () => {
    const kill = vi.fn();
    killProcessTree(null, { kill });
    killProcessTree({}, { kill });
    expect(kill).not.toHaveBeenCalled();
  });
});

describe('executeModel timeout + tree-kill', () => {
  it('kills the process tree and rejects a timed-out attempt', async () => {
    const child = createFakeChild(); // never emits 'close' — simulates a hang
    const spawnImpl = vi.fn(() => child);
    const killTree = vi.fn();
    const routing = makeRouting();

    await expect(
      executeModel('claude', 'hello', routing, {}, {
        spawn: spawnImpl,
        timeoutMs: 20,
        killTree,
        maxAttempts: 1,
      })
    ).rejects.toMatchObject({ timedOut: true });

    expect(killTree).toHaveBeenCalledWith(child);
  });

  it('retries once after a timeout and resolves if the retry succeeds', async () => {
    const firstChild = createFakeChild(); // hangs
    const secondChild = createFakeChild();
    const spawnImpl = vi
      .fn()
      .mockImplementationOnce(() => firstChild)
      .mockImplementationOnce(() => {
        setTimeout(() => secondChild.emit('close', 0), 1);
        return secondChild;
      });
    const killTree = vi.fn();
    const routing = makeRouting();

    const result = await executeModel('claude', 'hello', routing, {}, {
      spawn: spawnImpl,
      timeoutMs: 20,
      killTree,
      maxAttempts: 2,
    });

    expect(result).toBe(0);
    expect(spawnImpl).toHaveBeenCalledTimes(2);
    expect(killTree).toHaveBeenCalledTimes(1);
  });

  it('does not retry a normal non-zero exit — only timeouts are retryable', async () => {
    const child = createFakeChild();
    const spawnImpl = vi.fn(() => child);
    const routing = makeRouting();

    const promise = executeModel('claude', 'hello', routing, {}, {
      spawn: spawnImpl,
      timeoutMs: 1000,
      maxAttempts: 3,
    });
    child.emit('close', 1);

    await expect(promise).resolves.toBe(1);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });

  it('does not kill the process or misfire when the model completes normally', async () => {
    const child = createFakeChild();
    const spawnImpl = vi.fn(() => child);
    const killTree = vi.fn();
    const routing = makeRouting();

    const promise = executeModel('claude', 'hello', routing, {}, {
      spawn: spawnImpl,
      timeoutMs: 1000,
      killTree,
    });
    child.emit('close', 0);

    await expect(promise).resolves.toBe(0);
    expect(killTree).not.toHaveBeenCalled();
  });
});

describe('executeModelCapture timeout + tree-kill', () => {
  it('captures stdout and resolves {code, output}', async () => {
    const child = createFakeChild();
    const spawnImpl = vi.fn(() => child);
    const routing = makeRouting();

    const promise = executeModelCapture('claude', 'hello', routing, {}, {
      spawn: spawnImpl,
      timeoutMs: 1000,
    });
    child.stdout.emit('data', Buffer.from('partial '));
    child.stdout.emit('data', Buffer.from('output'));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({ code: 0, output: 'partial output' });
  });

  it('kills the process tree and rejects a timed-out attempt', async () => {
    const child = createFakeChild();
    const spawnImpl = vi.fn(() => child);
    const killTree = vi.fn();
    const routing = makeRouting();

    await expect(
      executeModelCapture('claude', 'hello', routing, {}, {
        spawn: spawnImpl,
        timeoutMs: 20,
        killTree,
        maxAttempts: 1,
      })
    ).rejects.toMatchObject({ timedOut: true });

    expect(killTree).toHaveBeenCalledWith(child);
  });
});

describe('scrubSecrets', () => {
  it('redacts an API-key-shaped token embedded in free text', () => {
    const input = { task: 'call the model using sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890' };
    const result = scrubSecrets(input);
    expect(result.task).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result.task).toContain('[REDACTED]');
  });

  it('redacts key=value style secrets nested inside an object', () => {
    const input = { plan: { env: { note: 'export API_KEY=supersecretvalue123' } } };
    const result = scrubSecrets(input);
    expect(result.plan.env.note).not.toContain('supersecretvalue123');
  });

  it('leaves ordinary text and non-string values untouched', () => {
    const input = { runId: 'hermes-1', exitCode: 0, ok: true, note: 'fix xirr calculation' };
    const result = scrubSecrets(input);
    expect(result).toEqual(input);
  });
});

describe('writeRunLedger secret scrubbing', () => {
  it('does not write a raw API key to the ledger file', () => {
    let written = '';
    const fs = {
      mkdirSync: () => {},
      writeFileSync: (_file, content) => {
        written = content;
      },
    };

    writeRunLedger(
      { runId: 'test-run', plan: { task: 'use token sk-proj-abcdefghijklmnopqrstuvwx' } },
      { root: '/tmp/orchestrate-ledger-test', fs }
    );

    expect(written).not.toContain('sk-proj-abcdefghijklmnopqrstuvwx');
    expect(written).toContain('[REDACTED]');
  });
});
